#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { PipelineStack } from '../lib/pipeline-stack';
import { EphemeralStack } from '../lib/ephemeral-stack';
import { GithubOidcStack } from '../lib/github-oidc-stack';
import { AuthCoreStack } from '../lib/auth-core-stack';
import { ApiStack } from '../lib/api-stack';
import { DataStack } from '../lib/data-stack';

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
  'arn:aws:codestar-connections:us-east-1:625961017727:connection/fbfcfe3b-0cb6-44fb-b4ba-cd6390ff8c24';

// CDK Pipelines requires a concrete (non env-agnostic) environment so the
// self-mutation step can resolve the bootstrap roles. Fall back to the known
// production account/region when CDK_DEFAULT_* are not set.
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT ?? '625961017727',
  region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
};

// ID of the shared Cognito User Pool created by the one-time `AuthCoreStack`.
// `AuthCoreStack` is deployed separately, so its output is not available at
// pipeline synth time — it must be supplied here as CDK context. Defaults to
// an empty string so the FIRST pipeline synth (before AuthCoreStack exists)
// does not fail; `AppStage` skips the per-env `AuthStack` while it is empty.
//
// After deploying `AuthCoreStack`, copy its `UserPoolId` output into
// `cdk.json` -> `context.userPoolId` so the pipeline wires the app client.
const userPoolId =
  app.node.tryGetContext('userPoolId') ?? process.env.USER_POOL_ID ?? '';

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
  userPoolId,
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
// One-time shared Cognito User Pool + Google IdP. Like `GithubOidcStack`, this
// is always synthesised but deployed manually ONCE; it is never created or
// destroyed by PR events and the pool is `RemovalPolicy.RETAIN`. After it is
// deployed, its `UserPoolId` output must be added to `cdk.json` context as
// `userPoolId` so the pipeline can attach per-environment app clients.
// ---------------------------------------------------------------------------
const authCoreStack = new AuthCoreStack(app, 'Auspex40kAuthCoreStack', {
  env,
  description:
    '40K Auspex shared Cognito User Pool + Google IdP (one-time, retained).',
});
// Exported for reference; the pipeline consumes the pool id via CDK context
// (see `userPoolId` above) because `AuthCoreStack` deploys independently.
void authCoreStack.userPool.userPoolId;

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

  const ephemeral = new EphemeralStack(app, `Auspex40kPrEnv-${pr}`, {
    prNumber: pr,
    userPoolId,
    env,
    description: `40K Auspex ephemeral preview environment for PR #${pr}.`,
  });

  // Each PR env gets its OWN HTTP API. Created only once auth is configured —
  // the JWT authorizer needs the per-PR app client. It is a sibling stack of
  // `EphemeralStack` (CDK forbids nesting one `Stack` inside another).
  if (userPoolId && ephemeral.userPoolClient) {
    // Each PR env also gets its own isolated companion DynamoDB table so
    // preview data never collides with production or another PR.
    const prData = new DataStack(app, `Auspex40kPrData-${pr}`, {
      env,
      description: `40K Auspex companion data tier for PR #${pr}.`,
      tableName: `auspex40k-companion-pr-${pr}`,
    });

    new ApiStack(app, `Auspex40kPrApi-${pr}`, {
      env,
      description: `40K Auspex HTTP API for PR #${pr} preview environment.`,
      userPoolId,
      userPoolClientId: ephemeral.userPoolClient.userPoolClientId,
      cognitoDomain: `https://cognito-idp.${env.region}.amazonaws.com/${userPoolId}`,
      companionTable: prData.table,
    });
  }
}
