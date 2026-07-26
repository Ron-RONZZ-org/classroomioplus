#!/usr/bin/env bash
# rebase-upstream.sh — Replay our fork commits on top of a new upstream release.
#
# Usage:  ./scripts/rebase-upstream.sh v1.5.0
#
# This fetches the given upstream tag, creates a temporary branch, and
# replays our commits on top of it via git rebase --onto. If a commit
# conflicts, the rebase pauses — fix the conflict, then `git rebase --continue`.
#
# After a successful rebase, force-push to update the fork:
#   git push --force-with-lease origin main
#
# Requires: git, access to classroomio/classroomio remote named "upstream".

set -euo pipefail

UPSTREAM_TAG="${1:?Usage: $0 <upstream-tag>}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$REPO_ROOT"

# Sanity: upstream remote must exist
if ! git remote get-url upstream &>/dev/null; then
  echo "Error: No 'upstream' remote configured. Add it with:"
  echo "  git remote add upstream https://github.com/classroomio/classroomio.git"
  exit 1
fi

# Find the base of our commits — the first commit that is not in upstream
echo "==> Finding fork base commit..."
FORK_BASE=$(git log --oneline --reverse --no-decorate main ^upstream/main 2>/dev/null | head -1 | awk '{print $1}')

if [ -z "$FORK_BASE" ]; then
  echo "Error: No fork commits found on main that aren't in upstream/main."
  echo "Are you sure you're on the right branch?"
  exit 1
fi

echo "    Fork base commit: $FORK_BASE"
echo "    (parent of fork base: $(git log --oneline -1 "$FORK_BASE~1" 2>/dev/null || echo 'none'))"

echo "==> Fetching upstream tag: $UPSTREAM_TAG"
git fetch upstream tag "$UPSTREAM_TAG" --no-tags

echo "==> Rebasing our commits onto $UPSTREAM_TAG"
echo "    Running: git rebase --onto $UPSTREAM_TAG $FORK_BASE~1 main"
echo ""
echo "    If a commit conflicts, resolve the conflict then run:"
echo "      git rebase --continue"
echo "    To abort:"
echo "      git rebase --abort"
echo ""

git rebase --onto "$UPSTREAM_TAG" "$FORK_BASE~1" main

echo ""
echo "✅ Rebase complete!"
echo ""
echo "Next steps:"
echo "  1. Verify the result:  git log --oneline main ^$UPSTREAM_TAG"
echo "  2. Build & test:       docker compose build"
echo "  3. Push:               git push --force-with-lease origin main"
echo "  4. Tag the release:    git tag v$UPSTREAM_TAG-plus && git push origin v$UPSTREAM_TAG-plus"
