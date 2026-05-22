import { Construct } from 'constructs';
import { CfnOutput, Stack, StackProps } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';

export interface GithubOidcStackProps extends StackProps {
  /** GitHub repository owner / org, e.g. "evenflow58". */
  readonly githubOwner: string;
  /** GitHub repository name, e.g. "40kauspex". */
  readonly githubRepo: string;
}

/**
 * One-time bootstrap stack that lets GitHub Actions assume an AWS IAM role
 * via OpenID Connect — no long-lived access keys.
 *
 * Deploy this ONCE, manually:
 *
 *   cd infrastructure
 *   pnpm install --ignore-workspace
 *   npx cdk deploy Auspex40kGithubOidcStack \
 *     -c githubOwner=evenflow58 -c githubRepo=40kauspex
 *
 * Then copy the `GithubActionsRoleArn` output into the repo's GitHub Actions
 * secret `AWS_DEPLOY_ROLE_ARN`.
 *
 * This stack is independent of both the production `DeploymentStack` and the
 * per-PR `EphemeralStack`; it is never created or destroyed by PR events.
 */
export class GithubOidcStack extends Stack {
  /** Role the ephemeral-environment workflow assumes. */
  public readonly deployRole: iam.Role;

  constructor(scope: Construct, id: string, props: GithubOidcStackProps) {
    super(scope, id, props);

    const { githubOwner, githubRepo } = props;

    // GitHub's OIDC identity provider. There can only be ONE per AWS account
    // for `token.actions.githubusercontent.com`; if another stack already
    // created it, import it instead of creating a duplicate.
    const provider = new iam.OpenIdConnectProvider(this, 'GithubOidcProvider', {
      url: 'https://token.actions.githubusercontent.com',
      clientIds: ['sts.amazonaws.com'],
    });

    // Trust policy: only workflows from this specific repository may assume
    // the role. `sub` is restricted to the repo (any branch / PR) and the
    // audience must be `sts.amazonaws.com`.
    const principal = new iam.OpenIdConnectPrincipal(provider, {
      StringEquals: {
        'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
      },
      StringLike: {
        'token.actions.githubusercontent.com:sub': `repo:${githubOwner}/${githubRepo}:*`,
      },
    });

    this.deployRole = new iam.Role(this, 'GithubActionsRole', {
      roleName: 'auspex40k-github-actions-ephemeral',
      assumedBy: principal,
      description:
        'Assumed by GitHub Actions to deploy/destroy ephemeral PR environments for 40K Auspex.',
      // CDK deploy/destroy of EphemeralStack touches many services. The CDK
      // bootstrap roles already gate the heavy permissions, so the workflow
      // role mainly needs to (a) assume the CDK bootstrap roles via
      // `sts:AssumeRole` on `cdk-*` roles and (b) sync to S3 / invalidate
      // CloudFront for the artifact upload step.
      inlinePolicies: {
        CdkAndDeploy: new iam.PolicyDocument({
          statements: [
            // Assume the CDK bootstrap roles (deploy, file-publishing,
            // lookup, image-publishing). These are the roles `cdk deploy`
            // and `cdk destroy` use to do the real work.
            new iam.PolicyStatement({
              sid: 'AssumeCdkBootstrapRoles',
              actions: ['sts:AssumeRole'],
              resources: [`arn:aws:iam::${this.account}:role/cdk-*`],
            }),
            // Read CloudFormation stack state so the workflow can resolve
            // stack outputs (the CloudFront URL) after a deploy.
            new iam.PolicyStatement({
              sid: 'ReadCloudFormation',
              actions: [
                'cloudformation:DescribeStacks',
                'cloudformation:DescribeStackEvents',
                'cloudformation:GetTemplate',
                'cloudformation:ListStacks',
              ],
              resources: ['*'],
            }),
            // Upload built artifacts to the PR bucket and invalidate the
            // PR distribution. Buckets and distributions are created fresh
            // per PR with ungenerated names, so these cannot be scoped to a
            // fixed ARN; the actions themselves are low-risk read/write.
            new iam.PolicyStatement({
              sid: 'SyncArtifactsAndInvalidate',
              actions: [
                's3:ListBucket',
                's3:GetObject',
                's3:PutObject',
                's3:DeleteObject',
                'cloudfront:CreateInvalidation',
                'cloudfront:GetInvalidation',
              ],
              resources: ['*'],
            }),
          ],
        }),
      },
    });

    new CfnOutput(this, 'GithubActionsRoleArn', {
      value: this.deployRole.roleArn,
      description:
        'Set this as the GitHub Actions repo secret AWS_DEPLOY_ROLE_ARN.',
    });

    new CfnOutput(this, 'OidcProviderArn', {
      value: provider.openIdConnectProviderArn,
      description: 'ARN of the GitHub Actions OIDC provider.',
    });
  }
}
