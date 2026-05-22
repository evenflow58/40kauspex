import { Construct } from 'constructs';
import { CfnOutput, Stack, StackProps } from 'aws-cdk-lib';
import { Hosting } from './hosting';
import { Pipeline } from './pipeline';

export interface DeploymentStackProps extends StackProps {
  readonly githubOwner: string;
  readonly githubRepo: string;
  readonly githubBranch: string;
}

/**
 * Single stack for the 40K Auspex front-end deployment:
 * static hosting (S3 + CloudFront) and the CI/CD pipeline that fills it.
 *
 * Hosting and pipeline are tightly coupled (the pipeline writes to the
 * bucket and invalidates the distribution), so they share one stack and
 * one deploy lifecycle.
 */
export class DeploymentStack extends Stack {
  constructor(scope: Construct, id: string, props: DeploymentStackProps) {
    super(scope, id, props);

    const hosting = new Hosting(this, 'Hosting');

    const pipeline = new Pipeline(this, 'Pipeline', {
      githubOwner: props.githubOwner,
      githubRepo: props.githubRepo,
      githubBranch: props.githubBranch,
      siteBucket: hosting.siteBucket,
      distribution: hosting.distribution,
    });

    new CfnOutput(this, 'SiteUrl', {
      value: `https://${hosting.distribution.distributionDomainName}`,
      description: 'Public URL of the 40K Auspex app (CloudFront).',
    });

    new CfnOutput(this, 'DistributionId', {
      value: hosting.distribution.distributionId,
      description: 'CloudFront distribution ID.',
    });

    new CfnOutput(this, 'SiteBucketName', {
      value: hosting.siteBucket.bucketName,
      description: 'S3 bucket holding the shell + mfe-home build artifacts.',
    });

    new CfnOutput(this, 'GitHubConnectionArn', {
      value: pipeline.connection.attrConnectionArn,
      description:
        'CodeStar connection ARN. Authorise it once: AWS console > Developer Tools > Connections > auspex40k-github > Update pending connection.',
    });
  }
}
