#!/bin/bash
# Release script — bumps version, updates changelog, commits, and tags.
#
# Usage:
#   ./scripts/release.sh <patch|minor|major>
#
# Example:
#   ./scripts/release.sh patch   # 0.1.0 → 0.1.1
#   ./scripts/release.sh minor   # 0.1.0 → 0.2.0

set -euo pipefail

BUMP="${1:?Usage: release.sh <patch|minor|major>}"

if [[ "$BUMP" != "patch" && "$BUMP" != "minor" && "$BUMP" != "major" ]]; then
  echo "Error: version bump must be 'patch', 'minor', or 'major'"
  exit 1
fi

# Ensure we're on main and clean
BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [[ "$BRANCH" != "main" ]]; then
  echo "Error: releases must be made from the 'main' branch (currently on '$BRANCH')"
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Error: working directory is not clean. Commit or stash changes first."
  exit 1
fi

# Ensure local main is up-to-date with origin
git fetch origin main --quiet
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)
if [[ "$LOCAL" != "$REMOTE" ]]; then
  echo "Error: local main ($LOCAL) is not in sync with origin/main ($REMOTE). Pull or push first."
  exit 1
fi

# Validate CHANGELOG exists before bumping version
CHANGELOG="framework/CHANGELOG.md"
CRAWLER_CHANGELOG="tools/crawler/CHANGELOG.md"
if [[ ! -f "$CHANGELOG" ]]; then
  echo "Error: $CHANGELOG not found."
  exit 1
fi

# P3-146: Validate CHANGELOG format before patching
if ! grep -qE '^## \[' "$CHANGELOG"; then
  echo "Error: $CHANGELOG does not contain expected '## [version]' heading format."
  exit 1
fi

# P3-194: Validate package.json files exist and are parseable
for pkg in framework/package.json tools/crawler/package.json; do
  if [[ ! -f "$pkg" ]]; then
    echo "Error: $pkg not found."
    exit 1
  fi
  if ! node -p "require('./$pkg').version" > /dev/null 2>&1; then
    echo "Error: cannot parse version from $pkg."
    exit 1
  fi
done

# Bump version in framework/package.json
cd framework
OLD_VERSION=$(node -p "require('./package.json').version")
npm version "$BUMP" --no-git-tag-version
NEW_VERSION=$(node -p "require('./package.json').version")
cd ..

# Bump version in tools/crawler/package.json
cd tools/crawler
npm version "$BUMP" --no-git-tag-version
cd ../..

echo "Version: $OLD_VERSION → $NEW_VERSION"

# Update CHANGELOG.md
DATE=$(date +%Y-%m-%d)
if [[ -f "$CHANGELOG" ]]; then
  # Insert new version header after the first line (title).
  # Use a temp file + mv for portability (macOS sed -i '' vs GNU sed -i).
  {
    head -n 1 "$CHANGELOG"
    printf '\n## v%s — %s\n\n- Version bump (%s release).\n' "$NEW_VERSION" "$DATE" "$BUMP"
    tail -n +2 "$CHANGELOG"
  } > "${CHANGELOG}.tmp" && mv "${CHANGELOG}.tmp" "$CHANGELOG"
fi

CRAWLER_CHANGELOG="tools/crawler/CHANGELOG.md"
if [[ -f "$CRAWLER_CHANGELOG" ]]; then
  {
    head -n 1 "$CRAWLER_CHANGELOG"
    printf '\n## v%s — %s\n\n- Version bump (%s release).\n' "$NEW_VERSION" "$DATE" "$BUMP"
    tail -n +2 "$CRAWLER_CHANGELOG"
  } > "${CRAWLER_CHANGELOG}.tmp" && mv "${CRAWLER_CHANGELOG}.tmp" "$CRAWLER_CHANGELOG"
fi

# Commit and tag (sign if GPG is configured)
git add framework/package.json tools/crawler/package.json "$CHANGELOG" "$CRAWLER_CHANGELOG"
git commit -m "release: v${NEW_VERSION}"
if git config --get user.signingkey &>/dev/null; then
  git tag -s "v${NEW_VERSION}" -m "release: v${NEW_VERSION}"
else
  git tag "v${NEW_VERSION}"
fi

echo ""
echo "Created commit and tag v${NEW_VERSION}."
echo "To publish:"
echo "  git push origin main --tags"
