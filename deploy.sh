#!/usr/bin/env bash
set -e

# Auto-bump cache version in layout.tsx before build
LAYOUT=src/app/layout.tsx
VERSION="$(date +%Y-%m-%d-%H%M%S)-darkbear-$(git rev-parse --short HEAD 2>/dev/null || echo local)"
sed -i "s/var v='[^']*'/var v='${VERSION}'/" "$LAYOUT"

NODE_OPTIONS="--disable-warning=DEP0205" pnpm build

DEST=/home/kain/website/darkbear
BACKUP=$(mktemp)
cp "$DEST/invite.json" "$BACKUP"
find "$DEST" -mindepth 1 ! -name invite.json -delete 2>/dev/null || true
cp -r out/. "$DEST/"
cp "$BACKUP" "$DEST/invite.json"
rm "$BACKUP"
echo "deployed $VERSION — clean copy, invite.json preserved"
