import { Construct } from 'constructs';
import { Stage, StageProps, CfnOutput } from 'aws-cdk-lib';
import { HostingStack } from './hosting-stack';
import { AuthStack } from './auth-stack';
import { ApiStack } from './api-stack';

export interface AppStageProps extends StageProps {
  /**
   * ID of the shared Cognito User Pool created by the one-time
   * `AuthCoreStack`. Threaded through from the pipeline's CDK context.
   * May be an empty string before `AuthCoreStack` has been deployed; in
   * that case the per-environment `AuthStack` is skipped so the first
   * pipeline synth does not fail.
   */
  readonly userPoolId: string;
}

/**
 * Deployable unit managed by the self-mutating CDK pipeline.
 *
 * A `Stage` is the granularity at which `pipelines.CodePipeline` deploys
 * CloudFormation. This stage contains the production `HostingStack` and the
 * per-environment `AuthStack`; the pipeline adds it via `addStage()` and runs
 * the app build/deploy step as a `post` step once the CloudFormation has
 * converged.
 *
 * `siteBucketName`, `distributionId`, `siteUrl`, `userPoolId`,
 * `userPoolClientId` and `apiUrl` re-export the underlying stacks' CfnOutputs
 * at stage scope so the pipeline can reference them with
 * `CodeBuildStep.envFromCfnOutputs`.
 */
export class AppStage extends Stage {
  /** Hosting stack's bucket-name output, for the pipeline build step. */
  public readonly siteBucketName: CfnOutput;
  /** Hosting stack's distribution-id output, for the pipeline build step. */
  public readonly distributionId: CfnOutput;
  /** Hosting stack's public site URL output, for the pipeline build step. */
  public readonly siteUrl: CfnOutput;
  /**
   * Auth stack's User Pool ID output. Undefined when `AuthCoreStack` has not
   * yet been deployed (no `userPoolId` context value).
   */
  public readonly userPoolId?: CfnOutput;
  /**
   * Auth stack's app client ID output. Undefined when `AuthCoreStack` has not
   * yet been deployed.
   */
  public readonly userPoolClientId?: CfnOutput;
  /**
   * API stack's HTTP API invoke URL output. Undefined when `AuthCoreStack`
   * has not yet been deployed — the `ApiStack` (and its JWT authorizer) is
   * only created once the shared User Pool exists.
   */
  public readonly apiUrl?: CfnOutput;

  constructor(scope: Construct, id: string, props: AppStageProps) {
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
    this.siteUrl = hosting.siteUrlOutput;

    // The per-environment auth stack can only be synthesised once the shared
    // User Pool exists. `AuthCoreStack` is deployed separately and once; until
    // its `UserPoolId` is added to the pipeline's CDK context, `userPoolId` is
    // an empty string and the AuthStack is skipped to keep synth green.
    if (props.userPoolId) {
      const auth = new AuthStack(this, 'Auspex40kAuthStack', {
        description:
          '40K Auspex per-environment Cognito app client on the shared User Pool.',
        userPoolId: props.userPoolId,
        distributionDomain: hosting.distributionDomainName,
      });

      this.userPoolId = auth.userPoolIdOutput;
      this.userPoolClientId = auth.userPoolClientIdOutput;

      // The HTTP API tier is only meaningful once the JWT authorizer can be
      // wired to the shared pool. `auth.userPoolClient.userPoolClientId` is a
      // plain CloudFormation token (not a CfnOutput) — passed directly so CDK
      // materialises the cross-stack reference.
      const api = new ApiStack(this, 'Auspex40kApiStack', {
        description:
          '40K Auspex HTTP API Gateway (Cognito JWT authorizer + health check).',
        userPoolId: props.userPoolId,
        userPoolClientId: auth.userPoolClient.userPoolClientId,
        cognitoDomain: `https://cognito-idp.${this.region}.amazonaws.com/${props.userPoolId}`,
      });

      this.apiUrl = api.apiUrlOutput;
    }
  }
}
