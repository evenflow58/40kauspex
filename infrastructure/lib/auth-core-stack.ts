import { Construct } from 'constructs';
import { CfnOutput, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';

/**
 * One-time bootstrap stack that owns the shared 40K Auspex Cognito User Pool,
 * its Hosted UI prefix domain, and the Google federated identity provider.
 *
 * Deploy this ONCE, manually (it is synthesised on every `cdk synth` but is
 * never created or destroyed by the pipeline or PR events):
 *
 *   cd infrastructure
 *   pnpm install --ignore-workspace
 *   npx cdk deploy Auspex40kAuthCoreStack
 *
 * Prerequisite: the `auspex40k/auth/google-oauth` Secrets Manager secret must
 * already exist with a `{ clientId, clientSecret }` JSON value (see the auth
 * ADR runbook). The plaintext is never rendered into the synthesised template
 * — CDK emits a CloudFormation dynamic reference.
 *
 * The User Pool is `RemovalPolicy.RETAIN`: it is a long-lived shared resource
 * across production and every ephemeral PR environment. Per-environment app
 * clients are added by the separate `AuthStack`, which imports this pool.
 *
 * After deploying, copy the `UserPoolId` output into the pipeline's CDK
 * context (`cdk.json` -> `context.userPoolId`) so `AppStage`/`AuthStack` can
 * attach the per-environment app client to it.
 */
export class AuthCoreStack extends Stack {
  /** The shared Cognito User Pool. */
  public readonly userPool: cognito.UserPool;
  /** The Google identity provider attached to the pool. */
  public readonly googleProvider: cognito.UserPoolIdentityProviderGoogle;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // ---- Shared User Pool --------------------------------------------------
    // Email is the sign-in identifier. Self sign-up is disabled: identities
    // are created exclusively by federation (Google today, more later).
    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: 'auspex40k-users',
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      signInCaseSensitive: false,
      standardAttributes: {
        email: { required: true, mutable: true },
        fullname: { required: false, mutable: true },
        profilePicture: { required: false, mutable: true },
      },
      // The pool holds real user identities and must survive stack updates
      // and PR teardowns. Never destroy it implicitly.
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // ---- Hosted UI prefix domain ------------------------------------------
    // Produces https://auspex40k-auth.auth.<region>.amazoncognito.com — the
    // single, stable OAuth broker domain. Google's authorised redirect URI
    // points only at this domain, so it never changes per environment.
    this.userPool.addDomain('HostedUiDomain', {
      cognitoDomain: { domainPrefix: 'auspex40k-auth' },
    });

    // ---- Google identity provider -----------------------------------------
    // The Google OAuth client id/secret live only in Secrets Manager and in
    // Cognito's own configuration — never in git, CDK source, or the bundle.
    const googleSecret = secretsmanager.Secret.fromSecretNameV2(
      this,
      'GoogleOAuthSecret',
      'auspex40k/auth/google-oauth'
    );

    this.googleProvider = new cognito.UserPoolIdentityProviderGoogle(
      this,
      'GoogleIdP',
      {
        userPool: this.userPool,
        // `secretValueFromJson` yields a CloudFormation dynamic reference
        // (`{{resolve:secretsmanager:...}}`); `unsafeUnwrap` only exposes that
        // token string (NOT the plaintext) so it can satisfy the `string`-typed
        // `clientId` prop. The real value is resolved by CloudFormation at
        // deploy time and never appears in the synthesised template.
        clientId: googleSecret
          .secretValueFromJson('clientId')
          .unsafeUnwrap(),
        clientSecretValue: googleSecret.secretValueFromJson('clientSecret'),
        scopes: ['profile', 'email', 'openid'],
        // Map Google profile claims onto the pool's standard attributes so
        // the minted Cognito JWT carries email / name / picture.
        attributeMapping: {
          email: cognito.ProviderAttribute.GOOGLE_EMAIL,
          fullname: cognito.ProviderAttribute.GOOGLE_NAME,
          profilePicture: cognito.ProviderAttribute.GOOGLE_PICTURE,
        },
      }
    );

    // ---- Outputs -----------------------------------------------------------
    new CfnOutput(this, 'UserPoolId', {
      value: this.userPool.userPoolId,
      description:
        'Shared Cognito User Pool ID. Set this as the pipeline CDK context key `userPoolId` in cdk.json.',
    });

    new CfnOutput(this, 'UserPoolProviderName', {
      value: this.userPool.userPoolProviderName,
      description: 'Cognito User Pool provider name.',
    });

    new CfnOutput(this, 'CognitoDomain', {
      value: `https://auspex40k-auth.auth.${this.region}.amazoncognito.com`,
      description: 'Cognito Hosted UI base URL (OAuth authorize/token/logout).',
    });
  }
}
