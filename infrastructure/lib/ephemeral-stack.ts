import { Construct } from 'constructs';
import { CfnOutput, Stack, StackProps, Tags } from 'aws-cdk-lib';
import { Hosting } from './hosting';
import { Auth } from './auth';

export interface EphemeralStackProps extends StackProps {
  /** The GitHub pull-request number this environment belongs to. */
  readonly prNumber: string;
  /**
   * ID of the shared Cognito User Pool created by the one-time
   * `AuthCoreStack`. Supplied via CDK context. When empty (before
   * `AuthCoreStack` is deployed) the per-PR `AuthStack` is skipped.
   */
  readonly userPoolId: string;
}

/**
 * Ephemeral per-PR environment for the 40K Auspex front-end.
 *
 * Reuses the production `Hosting` construct (private S3 bucket + CloudFront
 * distribution with OAC) but deliberately omits the CI/CD `Pipeline`: the
 * GitHub Actions workflow builds the PR branch and runs `aws s3 sync` +
 * a CloudFront invalidation directly.
 *
 * One CloudFormation stack per PR (stack name `Auspex40kPrEnv-<prNumber>`)
 * keeps every environment fully isolated and independently destroyable.
 * Both the bucket (`autoDeleteObjects` + `RemovalPolicy.DESTROY`) and the
 * distribution tear down cleanly on `cdk destroy`.
 *
 * Auth: each PR env gets its OWN Cognito app client (a nested `AuthStack`
 * construct) on the SHARED User Pool, with callback URLs scoped to that PR's
 * CloudFront domain. The pool itself is owned by `AuthCoreStack` and is never
 * touched by a PR teardown — the app client is removed cleanly with the
 * stack while the pool and all users survive.
 *
 * The production stack (`Auspex40kDeploymentStack`) is never referenced or
 * mutated by this stack.
 */
export class EphemeralStack extends Stack {
  constructor(scope: Construct, id: string, props: EphemeralStackProps) {
    super(scope, id, props);

    const { prNumber, userPoolId } = props;

    const hosting = new Hosting(this, 'Hosting');

    // Tag every resource so ephemeral environments are easy to identify,
    // cost-attribute, and sweep if a teardown is ever missed.
    Tags.of(this).add('Project', '40kauspex');
    Tags.of(this).add('Environment', 'ephemeral');
    Tags.of(this).add('PullRequest', prNumber);

    new CfnOutput(this, 'SiteUrl', {
      value: `https://${hosting.distribution.distributionDomainName}`,
      description: `Public URL of the PR #${prNumber} preview environment.`,
    });

    new CfnOutput(this, 'DistributionId', {
      value: hosting.distribution.distributionId,
      description: 'CloudFront distribution ID for the PR preview.',
    });

    new CfnOutput(this, 'SiteBucketName', {
      value: hosting.siteBucket.bucketName,
      description: 'S3 bucket holding the PR preview build artifacts.',
    });

    // Per-PR Cognito app client on the shared pool, via the same `Auth`
    // construct production uses. Skipped until `AuthCoreStack` has been
    // deployed and its id supplied via context — the PR env still deploys and
    // serves the site (with the checked-in placeholder auth-config.json).
    if (userPoolId) {
      const auth = new Auth(this, 'Auth', {
        userPoolId,
        distributionDomain: hosting.distribution.distributionDomainName,
      });

      // Stack-scoped outputs so `jq` in the workflow reads them by exact key.
      new CfnOutput(this, 'UserPoolClientId', {
        value: auth.userPoolClient.userPoolClientId,
        description: 'Cognito app client ID for the PR preview.',
      });

      new CfnOutput(this, 'UserPoolId', {
        value: userPoolId,
        description: 'Shared Cognito User Pool ID (for auth-config.json).',
      });
    }
  }
}
