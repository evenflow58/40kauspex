import { Construct } from 'constructs';
import { Stage, StageProps, CfnOutput } from 'aws-cdk-lib';
import { HostingStack } from './hosting-stack';

/**
 * Deployable unit managed by the self-mutating CDK pipeline.
 *
 * A `Stage` is the granularity at which `pipelines.CodePipeline` deploys
 * CloudFormation. This stage contains the production `HostingStack`; the
 * pipeline adds it via `addStage()` and runs the app build/deploy step as
 * a `post` step once the hosting CloudFormation has converged.
 *
 * `siteBucketName` and `distributionId` re-export the hosting stack's
 * CfnOutputs at stage scope so the pipeline can reference them with
 * `CodeBuildStep.envFromCfnOutputs`.
 */
export class AppStage extends Stage {
  /** Hosting stack's bucket-name output, for the pipeline build step. */
  public readonly siteBucketName: CfnOutput;
  /** Hosting stack's distribution-id output, for the pipeline build step. */
  public readonly distributionId: CfnOutput;

  constructor(scope: Construct, id: string, props?: StageProps) {
    super(scope, id, props);

    // Preserve the original stack name `Auspex40kDeploymentStack` so
    // CloudFormation treats this as an UPDATE to the existing stack rather
    // than creating a new one. This keeps the existing S3 bucket and
    // CloudFront distribution (and URL) intact during the pipeline migration.
    const hosting = new HostingStack(this, 'Auspex40kHostingStack', {
      stackName: 'Auspex40kDeploymentStack',
      description:
        '40K Auspex static hosting (private S3 bucket + CloudFront distribution).',
    });

    this.siteBucketName = hosting.siteBucketNameOutput;
    this.distributionId = hosting.distributionIdOutput;
  }
}
