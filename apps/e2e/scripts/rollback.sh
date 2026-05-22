#!/usr/bin/env bash
# Called from the E2E CodeBuild job's post_build phase.
# Rolls back to the previous deployment when E2E tests fail.
# Environment: CODEBUILD_BUILD_SUCCEEDING, SITE_BUCKET, DISTRIBUTION_ID
set -euo pipefail

if [ "${CODEBUILD_BUILD_SUCCEEDING:-1}" = "1" ]; then
  echo "[rollback] E2E tests passed — nothing to roll back"
  exit 0
fi

echo "[rollback] E2E tests FAILED — rolling back production deployment"

# ── Frontend ──────────────────────────────────────────────────────────────────
# Restore the pre-deploy backup that BuildAndDeploy saved to _backup/.
# If no backup exists (first-ever deploy) skip the S3 restore.
BACKUP_COUNT=$(aws s3 ls "s3://${SITE_BUCKET}/_backup/" --recursive 2>/dev/null | wc -l || echo 0)
if [ "${BACKUP_COUNT}" -gt 0 ]; then
  echo "[rollback] Restoring ${BACKUP_COUNT} objects from s3://${SITE_BUCKET}/_backup/"
  aws s3 sync "s3://${SITE_BUCKET}/_backup/" "s3://${SITE_BUCKET}/" --delete || true
  echo "[rollback] Invalidating CloudFront distribution ${DISTRIBUTION_ID}"
  aws cloudfront create-invalidation \
    --distribution-id "${DISTRIBUTION_ID}" \
    --paths "/*" || true
else
  echo "[rollback] No S3 backup found — skipping frontend restore (first deployment?)"
fi

# ── Infrastructure ────────────────────────────────────────────────────────────
# cloudformation rollback-stack reverts each stack to its last stable state.
# The calls return immediately; the actual rollback is async.
for STACK in Auspex40kDeploymentStack Prod-Auspex40kAuthStack Prod-Auspex40kApiStack; do
  echo "[rollback] Initiating rollback for CloudFormation stack: ${STACK}"
  aws cloudformation rollback-stack --stack-name "${STACK}" 2>&1 || true
done

echo "[rollback] Rollback initiated. CloudFormation stacks are reverting asynchronously."
echo "[rollback] Check the CloudFormation console to confirm rollback completion."
