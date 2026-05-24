---
name: feedback-no-amend-after-shared-commits
description: Never amend a merge commit (or any commit that may already be on the remote) — it rewrites the hash and causes re-merges to conflict again
metadata:
  type: feedback
---

Never use `--amend` on a merge commit or any commit that may already exist on the remote.

**Why:** Amending rewrites the commit hash. If the user has already pulled the original hash (or it was pushed), the next merge/pull treats the two hashes as divergent history, reintroducing the same conflict markers.

**How to apply:** When a merge commit needs a follow-up fix, make a new ordinary commit on top of it instead of amending.
