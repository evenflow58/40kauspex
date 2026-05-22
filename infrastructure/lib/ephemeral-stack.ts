import { Construct } from 'constructs';
import { CfnOutput, Stack, StackProps, Tags } from 'aws-cdk-lib';
import { Hosting } from './hosting';

export interface EphemeralStackProps extends StackProps {
  /** The GitHub pull-request number this environment belongs to. */
  readonly prNumber: string;
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
 * The production stack (`Auspex40kDeploymentStack`) is never referenced or
 * mutated by this stack.
 */
export class EphemeralStack extends Stack {
  constructor(scope: Construct, id: string, props: EphemeralStackProps) {
    super(scope, id, props);

    const { prNumber } = props;

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
  }
}
