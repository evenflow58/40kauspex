#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { DeploymentStack } from '../lib/deployment-stack';
import { EphemeralStack } from '../lib/ephemeral-stack';
import { GithubOidcStack } from '../lib/github-oidc-stack';

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

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

// ---------------------------------------------------------------------------
// Production hosting + CI/CD pipeline. Always synthesised so `cdk deploy`
// and `cdk diff` for the production stack behave exactly as before.
// ---------------------------------------------------------------------------
new DeploymentStack(app, 'Auspex40kDeploymentStack', {
  githubOwner,
  githubRepo,
  githubBranch,
  env,
  description:
    '40K Auspex static hosting (S3 + CloudFront) and CI/CD pipeline (CodePipeline + CodeBuild).',
});

// ---------------------------------------------------------------------------
// One-time GitHub OIDC bootstrap. Always synthesised but only deployed
// manually once (see GithubOidcStack docs). It has a fixed stack name and
// is never created/destroyed by PR events.
// ---------------------------------------------------------------------------
new GithubOidcStack(app, 'Auspex40kGithubOidcStack', {
  githubOwner,
  githubRepo,
  env,
  description:
    '40K Auspex GitHub Actions OIDC provider + IAM role for ephemeral PR environments.',
});

// ---------------------------------------------------------------------------
// Ephemeral per-PR environment. Synthesised ONLY when a `prNumber` context
// value is supplied, e.g.:
//
//   cdk deploy -c prNumber=42
//   cdk destroy -c prNumber=42
//
// Without `prNumber` this stack is absent from the app, so production
// `cdk deploy`/`cdk diff` never sees it.
// ---------------------------------------------------------------------------
const prNumber = app.node.tryGetContext('prNumber') ?? process.env.PR_NUMBER;

if (prNumber) {
  const pr = String(prNumber).trim();

  // Guard against an empty/invalid value producing a malformed stack name.
  if (!/^\d+$/.test(pr)) {
    throw new Error(
      `Invalid prNumber context value: "${prNumber}". Expected a positive integer.`
    );
  }

  new EphemeralStack(app, `Auspex40kPrEnv-${pr}`, {
    prNumber: pr,
    env,
    description: `40K Auspex ephemeral preview environment for PR #${pr}.`,
  });
}
