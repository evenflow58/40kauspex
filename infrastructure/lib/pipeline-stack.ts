import { Construct } from 'constructs';
import { Stack, StackProps } from 'aws-cdk-lib';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as iam from 'aws-cdk-lib/aws-iam';
import {
  CodePipeline,
  CodePipelineSource,
  ShellStep,
  CodeBuildStep,
} from 'aws-cdk-lib/pipelines';
import { AppStage } from './app-stage';

export interface PipelineStackProps extends StackProps {
  /** GitHub repository owner / org, e.g. "evenflow58". */
  readonly githubOwner: string;
  /** GitHub repository name, e.g. "40kauspex". */
  readonly githubRepo: string;
  /** Branch that triggers the pipeline, e.g. "main". */
  readonly githubBranch: string;
  /**
   * ARN of the pre-authorised CodeStar connection to GitHub. This is
   * account-specific infrastructure (not a secret); it is created and
   * authorised once in the AWS console and reused here.
   */
  readonly codestarConnectionArn: string;
}

/**
 * Self-mutating CI/CD pipeline for 40K Auspex, built on
 * `aws-cdk-lib/pipelines.CodePipeline`.
 *
 * Flow on every push to `main`:
 *
 *   1. Source     — GitHub via the existing CodeStar connection.
 *   2. Synth      — `cdk synth` of the infrastructure app (Node 22 + pnpm).
 *   3. SelfMutate — applies any change to the pipeline or other stacks
 *                   automatically (this is what removes the manual
 *                   `cdk deploy` step entirely).
 *   4. AppStage   — deploys `HostingStack` (S3 + CloudFront).
 *   5. BuildAndDeploy (post step) — installs, tests, builds the front-end
 *                   and syncs artifacts to S3 + invalidates CloudFront.
 *
 * Because the pipeline self-mutates, a human only ever has to push to
 * `main`: infrastructure changes AND app changes both deploy automatically.
 */
export class PipelineStack extends Stack {
  constructor(scope: Construct, id: string, props: PipelineStackProps) {
    super(scope, id, props);

    const { githubOwner, githubRepo, githubBranch, codestarConnectionArn } =
      props;

    // Production federation URL for the shell. Relative path so the shell
    // loads mfe-home's remoteEntry.js from the SAME CloudFront distribution,
    // sidestepping the chicken-and-egg of not knowing the domain at build time.
    const mfeHomeUrl = '/mfe-home/assets/remoteEntry.js';

    const source = CodePipelineSource.connection(
      `${githubOwner}/${githubRepo}`,
      githubBranch,
      { connectionArn: codestarConnectionArn }
    );

    // pnpm is not pre-installed on the CodeBuild image; corepack ships with
    // Node and activates the pinned pnpm version. Applied to every CodeBuild
    // project in the pipeline (synth, self-mutate, asset, app build) via
    // `codeBuildDefaults.partialBuildSpec`.
    const pnpmRuntime = codebuild.BuildSpec.fromObject({
      version: '0.2',
      phases: {
        install: {
          'runtime-versions': { nodejs: '22' },
        },
      },
    });

    // ---- Synth step --------------------------------------------------------
    // The `infrastructure/` package has its own pnpm-lock.yaml and is NOT a
    // workspace member, so `--ignore-workspace` is required for its install.
    const synth = new ShellStep('Synth', {
      input: source,
      commands: [
        'cd infrastructure',
        'corepack enable',
        'corepack prepare pnpm@11.2.2 --activate',
        'pnpm install --frozen-lockfile --ignore-workspace',
        'pnpm exec cdk synth',
      ],
      // `cdk synth` writes to infrastructure/cdk.out because the command runs
      // from the infrastructure/ directory.
      primaryOutputDirectory: 'infrastructure/cdk.out',
    });

    const pipeline = new CodePipeline(this, 'Pipeline', {
      pipelineName: 'auspex40k-pipeline',
      synth,
      // Self-mutation is the whole point: the pipeline applies changes to
      // itself and to any managed stack with no manual `cdk deploy`.
      selfMutation: true,
      // Single-account, single-region deployment — no cross-account KMS keys
      // needed, which keeps the artifact bucket simpler and cheaper.
      crossAccountKeys: false,
      codeBuildDefaults: {
        buildEnvironment: {
          // STANDARD_7_0 bundles a current AWS CLI; the partialBuildSpec
          // pins the Node 22 runtime on top of it.
          buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
          computeType: codebuild.ComputeType.SMALL,
        },
        partialBuildSpec: pnpmRuntime,
      },
    });

    // ---- Application stage + build/deploy step -----------------------------
    const appStage = new AppStage(this, 'Prod', {
      env: {
        account: this.account,
        region: this.region,
      },
    });

    // App build + deploy. A `CodeBuildStep` (not a bare ShellStep) so we can
    // attach scoped IAM for the S3 sync + CloudFront invalidation. Bucket name
    // and distribution id come from the HostingStack's CfnOutputs at deploy
    // time via `envFromCfnOutputs` — no hardcoding.
    const buildAndDeploy = new CodeBuildStep('BuildAndDeploy', {
      // The whole repo (workspace root) is needed to build the front-end.
      input: source,
      env: {
        VITE_MFE_HOME_URL: mfeHomeUrl,
        CI: 'true',
      },
      envFromCfnOutputs: {
        SITE_BUCKET: appStage.siteBucketName,
        DISTRIBUTION_ID: appStage.distributionId,
      },
      commands: [
        'corepack enable',
        'corepack prepare pnpm@11.2.2 --activate',
        'pnpm install --frozen-lockfile',
        // Tests gate the deploy: a non-zero exit fails the step before any
        // S3 sync runs.
        'pnpm test --run',
        'pnpm build',
        'aws s3 sync apps/mfe-home/dist "s3://$SITE_BUCKET/mfe-home" --delete',
        'aws s3 sync apps/shell/dist "s3://$SITE_BUCKET" --delete --exclude "mfe-home/*"',
        'aws cloudfront create-invalidation --distribution-id "$DISTRIBUTION_ID" --paths "/*"',
      ],
      // The site bucket name and distribution id are CDK-generated and not
      // known until the HostingStack deploys, so these statements cannot be
      // pinned to exact ARNs. They are scoped to the `Auspex40kDeploymentStack`
      // bucket-name prefix (CloudFormation derives bucket names from the
      // stack name) and to distributions in this account. The granted
      // actions only ever write build artifacts / trigger invalidations.
      rolePolicyStatements: [
        new iam.PolicyStatement({
          sid: 'SyncSiteArtifacts',
          actions: [
            's3:ListBucket',
            's3:GetObject',
            's3:PutObject',
            's3:DeleteObject',
          ],
          resources: [
            'arn:aws:s3:::auspex40kdeploymentstack-*',
            'arn:aws:s3:::auspex40kdeploymentstack-*/*',
          ],
        }),
        new iam.PolicyStatement({
          sid: 'InvalidateDistribution',
          actions: [
            'cloudfront:CreateInvalidation',
            'cloudfront:GetInvalidation',
          ],
          resources: [`arn:aws:cloudfront::${this.account}:distribution/*`],
        }),
      ],
    });

    pipeline.addStage(appStage, {
      post: [buildAndDeploy],
    });
  }
}
