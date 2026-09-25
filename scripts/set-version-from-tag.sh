#!/usr/bin/env bash
# The GitHub Release's tag is the version. package.json carries a placeholder
# on main; this stamps the tag's version into it (and the lockfile) just before
# the build, so a release is one act and no commit ever bumps a version.
# --check validates the tag and stops before stamping: publish.yml's first job
# runs it so a bad tag fails in seconds, with one copy of the pattern.
set -euo pipefail

check_only=false
if [ "${1:-}" = "--check" ]; then
  check_only=true
  shift
fi
tag="${1:?usage: set-version-from-tag.sh [--check] <tag>}"

if [[ ! "$tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Tag '$tag' is not a stable release tag (vX.Y.Z)." >&2
  echo "Prerelease and malformed tags are not published from this repo." >&2
  exit 1
fi

if [ "$check_only" = true ]; then
  echo "Tag $tag names a stable release."
  exit 0
fi

version="${tag#v}"
placeholder="$(node -p "require('./package.json').version")"
npm version "$version" --no-git-tag-version --allow-same-version > /dev/null

echo "package.json version set from tag $tag: $placeholder -> $version"
