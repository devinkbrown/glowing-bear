#!/usr/bin/env bash
set -e

# Auto-bump cache version in index.html before build (matches the asset-version
# reload script in <head>; unregisters stale service workers on change).
VERSION="$(date +%Y-%m-%d-%H%M%S)-darkbear-$(git rev-parse --short HEAD 2>/dev/null || echo local)"
sed -i "s/var v = '[^']*'/var v = '${VERSION}'/" index.html

pnpm build

DEST=/home/kain/website/darkbear
mkdir -p "$DEST"
find "$DEST" -mindepth 1 -delete 2>/dev/null || true
cp -r out/. "$DEST/"
echo "deployed $VERSION — clean copy to $DEST"
