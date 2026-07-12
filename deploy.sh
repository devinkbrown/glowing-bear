#!/usr/bin/env bash
set -e

# DarkBear deploy. nginx serves /darkbear/ directly from this repo's out/
# (alias /home/kain/darkbear/out/, SPA fallback to /darkbear/index.html), so a
# deploy is just a fresh build into out/ — no copy step, no nginx reload needed
# for content changes.
cd "$(dirname "$0")"

# Stamp the asset version in index.html (matches the cache-bust reload script in
# <head>; unregisters stale service workers and reloads clients on change).
VERSION="$(date +%Y-%m-%d-%H%M%S)-darkbear-$(git rev-parse --short HEAD 2>/dev/null || echo local)"
sed -i "s/var v = '[^']*'/var v = '${VERSION}'/" index.html

pnpm build
echo "deployed $VERSION → /home/kain/darkbear/out/ (served live at /darkbear/)"
