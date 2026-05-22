import { Construct } from 'constructs';
import { Stack } from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as actions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as codestarconnections from 'aws-cdk-lib/aws-codestarconnections';

export interface PipelineProps {
  /** GitHub repository owner / org, e.g. "evenflow58". */
  readonly githubOwner: string;
  /** GitHub repository name, e.g. "40kauspex". */
  readonly githubRepo: string;
  /** Branch that triggers the pipeline, e.g. "main". */
  readonly githubBranch: string;
  /** Bucket the built site artifacts are synced into. */
  readonly siteBucket: s3.IBucket;
  /** Distribution whose cache is invalidated after a deploy. */
  readonly distribution: cloudfront.IDistribution;
}

/**
 * CI/CD pipeline for the 40K Auspex front-end.
 *
 *   Source : GitHub `main` via a CodeStar Connection (GitHub source v2).
 *   Build  : CodeBuild — bootstraps pnpm via corepack, runs `pnpm build`,
 *            syncs artifacts to S3 and invalidates CloudFront.
 *
 * The deploy step lives inside the CodeBuild project (rather than a separate
 * S3 deploy action) because it needs `aws s3 sync` semantics — separate
 * prefixes for the shell and mfe-home, plus a CloudFront invalidation. The
 * pipeline therefore has two stages: Source and Build.
 */
export class Pipeline extends Construct {
  /** The CodeStar connection to GitHub — must be authorised once in the console. */
  public readonly connection: codestarconnections.CfnConnection;

  constructor(scope: Construct, id: string, props: PipelineProps) {
    super(scope, id);

    const account = Stack.of(this).account;

    // CodeStar Connection to GitHub. Created in PENDING state — a human must
    // authorise it once in the AWS console (see stack output / README).
    this.connection = new codestarconnections.CfnConnection(
      this,
      'GitHubConnection',
      {
        connectionName: 'auspex40k-github',
        providerType: 'GitHub',
      }
    );

    // Production federation URL for the shell. Relative path so the shell
    // loads mfe-home's remoteEntry.js from the SAME CloudFront distribution,
    // sidestepping the chicken-and-egg of not knowing the domain at build time.
    const mfeHomeUrl = '/mfe-home/assets/remoteEntry.js';

    const buildProject = new codebuild.PipelineProject(this, 'BuildProject', {
      projectName: 'auspex40k-build',
      environment: {
        // Standard image bundles Node 20 and the AWS CLI.
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
        computeType: codebuild.ComputeType.SMALL,
      },
      environmentVariables: {
        VITE_MFE_HOME_URL: { value: mfeHomeUrl },
        SITE_BUCKET: { value: props.siteBucket.bucketName },
        DISTRIBUTION_ID: { value: props.distribution.distributionId },
      },
      // Cache the pnpm store between builds for faster installs. CUSTOM mode
      // caches the paths declared under `cache.paths` in the buildspec below.
      cache: codebuild.Cache.local(
        codebuild.LocalCacheMode.CUSTOM,
        codebuild.LocalCacheMode.SOURCE
      ),
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        env: {
          variables: {
            CI: 'true',
          },
        },
        phases: {
          install: {
            'runtime-versions': { nodejs: '22' },
            commands: [
              'echo "Bootstrapping pnpm via corepack..."',
              // pnpm is not preinstalled in CodeBuild images; corepack ships
              // with Node 20 and activates the version pinned in package.json.
              'corepack enable',
              'corepack prepare pnpm@11.2.2 --activate',
              // Put the pnpm store at a fixed path so the local cache can keep it.
              'pnpm config set store-dir /root/.pnpm-store',
              'pnpm --version',
            ],
          },
          pre_build: {
            commands: [
              'echo "Installing dependencies..."',
              'pnpm install --frozen-lockfile',
            ],
          },
          build: {
            commands: [
              'echo "Building all workspaces with VITE_MFE_HOME_URL=$VITE_MFE_HOME_URL"',
              'pnpm build',
            ],
          },
          post_build: {
            commands: [
              'echo "Deploying to S3 bucket $SITE_BUCKET"',
              // mfe-home first (hashed assets), then shell at the root.
              // --delete keeps the bucket in sync with the latest build.
              'aws s3 sync apps/mfe-home/dist "s3://$SITE_BUCKET/mfe-home" --delete',
              'aws s3 sync apps/shell/dist "s3://$SITE_BUCKET" --delete --exclude "mfe-home/*"',
              'echo "Invalidating CloudFront distribution $DISTRIBUTION_ID"',
              'aws cloudfront create-invalidation --distribution-id "$DISTRIBUTION_ID" --paths "/*"',
            ],
          },
        },
        cache: {
          // Persisted between builds via the CUSTOM local cache mode above.
          paths: ['/root/.pnpm-store/**/*'],
        },
      }),
    });

    // CodeBuild needs to write to the bucket and invalidate the distribution.
    props.siteBucket.grantReadWrite(buildProject);
    buildProject.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'cloudfront:CreateInvalidation',
          'cloudfront:GetInvalidation',
        ],
        resources: [
          `arn:aws:cloudfront::${account}:distribution/${props.distribution.distributionId}`,
        ],
      })
    );

    // ---- Pipeline ----------------------------------------------------------
    const sourceOutput = new codepipeline.Artifact('SourceOutput');

    const sourceAction = new actions.CodeStarConnectionsSourceAction({
      actionName: 'GitHub_Source',
      owner: props.githubOwner,
      repo: props.githubRepo,
      branch: props.githubBranch,
      connectionArn: this.connection.attrConnectionArn,
      output: sourceOutput,
      // Pipeline auto-triggers on pushes to the branch.
      triggerOnPush: true,
    });

    const buildAction = new actions.CodeBuildAction({
      actionName: 'Build_And_Deploy',
      project: buildProject,
      input: sourceOutput,
    });

    new codepipeline.Pipeline(this, 'Pipeline', {
      pipelineName: 'auspex40k-pipeline',
      // V1: CDK correctly grants codebuild:StartBuild to the pipeline service
      // role. V2 creates per-action IAM roles but the grant is never attached
      // to them, causing the pipeline to fail with AccessDeniedException.
      pipelineType: codepipeline.PipelineType.V1,
      restartExecutionOnUpdate: true,
      stages: [
        { stageName: 'Source', actions: [sourceAction] },
        { stageName: 'Build', actions: [buildAction] },
      ],
    });
  }
}
