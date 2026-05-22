import { Construct } from 'constructs';
import { Duration } from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';

export interface AuthProps {
  /**
   * ID of the shared Cognito User Pool created by `AuthCoreStack`. The pool
   * is imported (never created here) so its lifecycle stays decoupled.
   */
  readonly userPoolId: string;
  /**
   * CloudFront distribution domain for this environment (no scheme), e.g.
   * `d32ma5g6gjg1fb.cloudfront.net`. Used to build the OAuth callback and
   * logout URLs at synth time.
   */
  readonly distributionDomain: string;
}

/**
 * Per-environment auth construct: adds one Cognito User Pool **app client**
 * to the shared pool owned by `AuthCoreStack`.
 *
 * Mirrors the `Hosting` construct split — it is reused by both the
 * production `AuthStack` (inside `AppStage`) and the per-PR `EphemeralStack`
 * so the same app-client wiring serves every environment. The pool itself is
 * imported, never created, keeping its long-lived lifecycle independent of
 * any pipeline or PR teardown.
 *
 * The Google identity provider lives in `AuthCoreStack`, a one-time
 * prerequisite always deployed first, so it exists when this app client is
 * created. `supportedIdentityProviders` references the provider by its
 * stable name (`Google`), resolved by Cognito at deploy time — no in-app
 * construct dependency is needed.
 */
export class Auth extends Construct {
  /** The per-environment app client. */
  public readonly userPoolClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props: AuthProps) {
    super(scope, id);

    const { userPoolId, distributionDomain } = props;

    // Import the shared pool — the app client only needs the pool's id.
    const userPool = cognito.UserPool.fromUserPoolId(
      this,
      'SharedUserPool',
      userPoolId
    );

    // Per-environment OAuth redirect targets. localhost is included so the
    // same client also serves local `pnpm dev` against the deployed pool.
    const callbackUrls = [
      `https://${distributionDomain}/auth/callback`,
      'http://localhost:3000/auth/callback',
    ];
    const logoutUrls = [
      `https://${distributionDomain}/`,
      'http://localhost:3000/',
    ];

    this.userPoolClient = new cognito.UserPoolClient(this, 'AppClient', {
      userPool,
      // Public SPA client: no secret, PKCE-only authorization code flow.
      generateSecret: false,
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
          implicitCodeGrant: false,
        },
        scopes: [
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.PROFILE,
        ],
        callbackUrls,
        logoutUrls,
      },
      // Google is the only enabled provider for v1; extend this list to add
      // more (Apple, Microsoft, Cognito native) without touching the frontend.
      supportedIdentityProviders: [
        cognito.UserPoolClientIdentityProvider.GOOGLE,
      ],
      // Token validity per the auth ADR (revisit when the API tier lands).
      accessTokenValidity: Duration.minutes(60),
      idTokenValidity: Duration.minutes(60),
      refreshTokenValidity: Duration.days(30),
      enableTokenRevocation: true,
      preventUserExistenceErrors: true,
    });
  }
}
