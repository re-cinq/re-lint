#!/usr/bin/env bash
# Fail unless package.json carries the release tag's version.
#
# npm rejects a duplicate version and the rejection reads like an auth failure,
# so a tag whose package.json was never bumped publishes nothing and nobody
# notices (re-cinq/ai-agent-subsystem#139). This turns that silence into a red
# job that names the fix.
#
#   scripts/check-version.sh v0.2.0
set -euo pipefail

tag="${1:-}"

if [ -z "$tag" ]; then
	echo "usage: $0 <tag>   (e.g. v0.2.0)" >&2
	exit 2
fi

cd "$(dirname "$0")/.."

version="$(node -p "require('./package.json').version")"

if [ "v$version" = "$tag" ]; then
	echo "package version $version matches the release tag $tag."
	exit 0
fi

echo "ERROR: tag is $tag but package.json is $version." >&2
echo "Bump it in the release PR, then re-tag:" >&2
echo "  npm version ${tag#v} --no-git-tag-version" >&2
exit 1
