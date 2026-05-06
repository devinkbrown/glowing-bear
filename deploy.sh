#!/usr/bin/env bash
set -e
DEST=/home/kain/website/darkbear
BACKUP=$(mktemp)
cp "$DEST/invite.json" "$BACKUP"
cp -r out/. "$DEST/"
cp "$BACKUP" "$DEST/invite.json"
rm "$BACKUP"
echo "deployed — invite.json preserved"
