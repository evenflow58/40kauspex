#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { PipelineStack } from '../lib/pipeline-stack';
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

// ARN of the pre-authorised CodeStar connection to GitHub. Account-specific
// infrastructure (not a secret) — created and authorised once in the console
// and reused by the pipeline. Overridable via context for other accounts.
const codestarConnectionArn =
  app.node.tryGetContext('codestarConnectionArn') ??
  process.env.CODESTAR_CONNECTION_ARN ??
  'arn:aws:codestar-connections:us-east-1:625961017727:connection/6f2fe14d-cb27-4054-8785-73489305f1ec';

// CDK Pipelines requires a concrete (non env-agnostic) environment so the
// self-mutation step can resolve the bootstrap roles. Fall back to the known
// production account/region when CDK_DEFAULT_* are not set.
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT ?? '625961017727',
  region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
};

// ---------------------------------------------------------------------------
// Self-mutating production pipeline. Owns the `pipelines.CodePipeline`
// construct, which deploys the hosting stack as a managed stage and applies
// any infrastructure change to itself automatically. A human only ever has
// to push to `main` — no manual `cdk deploy`.
// ---------------------------------------------------------------------------
new PipelineStack(app, 'Auspex40kPipelineStack', {
  githubOwner,
  githubRepo,
  githubBranch,
  codestarConnectionArn,
  env,
  description:
    '40K Auspex self-mutating CI/CD pipeline (CDK Pipelines). Deploys the production hosting stack and builds/deploys the front-end.',
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
