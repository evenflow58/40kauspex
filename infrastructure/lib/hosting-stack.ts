import { Construct } from 'constructs';
import { CfnOutput, Stack, StackProps } from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import { Hosting } from './hosting';

/**
 * Production static-hosting stack for the 40K Auspex front-end.
 *
 * Owns ONLY the static hosting resources (private S3 bucket + CloudFront
 * distribution via the unchanged `Hosting` construct). The CI/CD pipeline
 * lives in a separate stack (`PipelineStack`) and manages this stack as a
 * deployable stage — the idiomatic CDK Pipelines layout.
 *
 * The bucket name and distribution id are surfaced as CfnOutputs so the
 * pipeline's app-build step can wire them into its build environment via
 * `CodeBuildStep.envFromCfnOutputs` — no hardcoding, no chicken-and-egg.
 */
export class HostingStack extends Stack {
  /** Bucket the built site artifacts are synced into. */
  public readonly siteBucket: s3.IBucket;
  /** Distribution whose cache is invalidated after a deploy. */
  public readonly distribution: cloudfront.IDistribution;
  /** Output carrying the generated bucket name (consumed by the pipeline). */
  public readonly siteBucketNameOutput: CfnOutput;
  /** Output carrying the distribution id (consumed by the pipeline). */
  public readonly distributionIdOutput: CfnOutput;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const hosting = new Hosting(this, 'Hosting');

    this.siteBucket = hosting.siteBucket;
    this.distribution = hosting.distribution;

    new CfnOutput(this, 'SiteUrl', {
      value: `https://${hosting.distribution.distributionDomainName}`,
      description: 'Public URL of the 40K Auspex app (CloudFront).',
    });

    this.distributionIdOutput = new CfnOutput(this, 'DistributionId', {
      value: hosting.distribution.distributionId,
      description: 'CloudFront distribution ID.',
    });

    this.siteBucketNameOutput = new CfnOutput(this, 'SiteBucketName', {
      value: hosting.siteBucket.bucketName,
      description: 'S3 bucket holding the shell + mfe-home build artifacts.',
    });
  }
}
