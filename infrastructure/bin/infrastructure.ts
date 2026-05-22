#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { DeploymentStack } from '../lib/deployment-stack';

const app = new cdk.App();

/**
 * Configuration is supplied via CDK context (cdk.json or -c flags) with
 * environment-variable fallbacks. Override at deploy time, e.g.:
 *
 *   cdk deploy -c githubOwner=evenflow58 -c githubRepo=40kauspex -c githubBranch=main
 */
const githubOwner =
  app.node.tryGetContext('githubOwner') ?? process.env.GITHUB_OWNER ?? 'evenflow58';
const githubRepo =
  app.node.tryGetContext('githubRepo') ?? process.env.GITHUB_REPO ?? '40kauspex';
const githubBranch =
  app.node.tryGetContext('githubBranch') ?? process.env.GITHUB_BRANCH ?? 'main';

new DeploymentStack(app, 'Auspex40kDeploymentStack', {
  githubOwner,
  githubRepo,
  githubBranch,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  description:
    '40K Auspex static hosting (S3 + CloudFront) and CI/CD pipeline (CodePipeline + CodeBuild).',
});
