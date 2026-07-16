#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
RELEASES="$ROOT/.releases"
LIVE="$ROOT/current"
PREVIOUS="$ROOT/.deploy-previous"
PUBLIC_URL="${DARKBEAR_PUBLIC_URL:-https://eshmaki.me/darkbear/}"
KEEP_RELEASES="${DARKBEAR_KEEP_RELEASES:-4}"
PROVENANCE="$ROOT/scripts/release-provenance.mjs"

cd "$ROOT"
umask 022

atomic_link() {
  local target="$1"
  local link="$2"
  local next="${link}.next.$$"
  rm -f "$next"
  ln -s "$target" "$next"
  mv -Tf "$next" "$link"
}

release_version() {
  sed -n "s/.*var v = '\([^']*\)'.*/\1/p" "$1/index.html" | head -n 1
}

verify_release() {
  local dir="$1"
  local version="$2"
  local path
  local assets=()

  for path in index.html manifest.json release.json sw.js offline.html offline.js opcodec_wasm.js opcodec_wasm.wasm kaguravox-capture-worklet.js; do
    test -s "$dir/$path" || { echo "missing release asset: $path" >&2; return 1; }
  done
  grep -Fq "var v = '$version'" "$dir/index.html" || {
    echo "release stamp mismatch: expected $version" >&2
    return 1
  }
  grep -Fq "const DEPLOY_VERSION = '$version'" "$dir/sw.js" || {
    echo "service-worker stamp mismatch: expected $version" >&2
    return 1
  }
  grep -Fq '"/darkbear/offline.html"' "$dir/sw.js" || {
    echo "service-worker precache manifest is missing the offline shell" >&2
    return 1
  }
  if grep -Fq '"/darkbear/index.html"' "$dir/sw.js"; then
    echo "service-worker must not cache index.html" >&2
    return 1
  fi

  mapfile -t assets < <(grep -oE '/darkbear/assets/[^" ]+\.(js|css)' "$dir/index.html" | sort -u)
  ((${#assets[@]} >= 2)) || { echo "built HTML has no JS/CSS entry assets" >&2; return 1; }
  for path in "${assets[@]}"; do
    test -s "$dir/${path#/darkbear/}" || { echo "missing referenced asset: $path" >&2; return 1; }
  done

  find "$dir" -type d -exec chmod 755 {} +
  find "$dir" -type f -exec chmod 644 {} +
  node "$PROVENANCE" verify "$dir" "$version"
}

verify_public() {
  local version="$1"
  local expected_release="${2:-}"
  local html
  local origin
  local path
  local public_release
  local release_url
  local assets=()
  local url="${PUBLIC_URL}?dbv=${version}"

  origin="$(node -e 'process.stdout.write(new URL(process.argv[1]).origin)' "$PUBLIC_URL")"
  html="$(curl -kfsS --retry 2 --retry-delay 1 "$url")"
  grep -Fq "var v = '$version'" <<<"$html" || {
    echo "public deploy stamp mismatch: expected $version" >&2
    return 1
  }
  mapfile -t assets < <(grep -oE '/darkbear/assets/[^" ]+\.(js|css)' <<<"$html" | sort -u)
  ((${#assets[@]} >= 2)) || { echo "public HTML has no JS/CSS entry assets" >&2; return 1; }
  for path in "${assets[@]}" /darkbear/manifest.json /darkbear/sw.js /darkbear/offline.html /darkbear/offline.js /darkbear/opcodec_wasm.wasm /darkbear/kaguravox-capture-worklet.js; do
    curl -kfsSI --retry 2 --retry-delay 1 "${origin}${path}" >/dev/null || {
      echo "public asset check failed: $path" >&2
      return 1
    }
  done
  if [[ -n "$expected_release" ]]; then
    test -s "$expected_release" || {
      echo "local release provenance is missing: $expected_release" >&2
      return 1
    }
    release_url="$(node -e 'const value = process.argv[1]; const base = value.endsWith("/") ? value : `${value}/`; process.stdout.write(new URL("release.json", base).href)' "$PUBLIC_URL")"
    public_release="$(curl -kfsS --retry 2 --retry-delay 1 "${release_url}?dbv=${version}")"
    if [[ "$public_release" != "$(cat "$expected_release")" ]]; then
      echo "public release provenance mismatch: expected $version" >&2
      return 1
    fi
  fi
  node scripts/verify-live.mjs "$PUBLIC_URL" "$version"
}

rollback() {
  local current_target
  local previous_release=""
  local previous_target
  local previous_version

  test -L "$LIVE" || { echo "cannot rollback: $LIVE is not a symlink" >&2; return 1; }
  test -L "$PREVIOUS" || { echo "cannot rollback: no previous release recorded" >&2; return 1; }
  current_target="$(readlink -f "$LIVE")"
  previous_target="$(readlink -f "$PREVIOUS")"
  test -d "$previous_target" || { echo "cannot rollback: previous release is missing" >&2; return 1; }
  previous_version="$(release_version "$previous_target")"
  test -n "$previous_version" || { echo "cannot rollback: previous release has no stamp" >&2; return 1; }
  if [[ -s "$previous_target/release.json" ]]; then
    previous_release="$previous_target/release.json"
    node "$PROVENANCE" verify "$previous_target" "$previous_version"
  fi

  atomic_link "$previous_target" "$LIVE"
  atomic_link "$current_target" "$PREVIOUS"
  if ! verify_public "$previous_version" "$previous_release"; then
    echo "rollback postflight failed; restoring $current_target" >&2
    atomic_link "$current_target" "$LIVE"
    atomic_link "$previous_target" "$PREVIOUS"
    return 1
  fi
  echo "rolled back to $previous_version ($previous_target)"
}

prune_releases() {
  local current_target
  local previous_target
  local dir
  local kept=0
  local dirs=()

  current_target="$(readlink -f "$LIVE")"
  previous_target="$(readlink -f "$PREVIOUS" 2>/dev/null || true)"
  mapfile -t dirs < <(find "$RELEASES" -mindepth 1 -maxdepth 1 -type d ! -name '.staging-*' -printf '%T@ %p\n' | sort -nr | cut -d' ' -f2-)
  for dir in "${dirs[@]}"; do
    if [[ "$dir" == "$current_target" || "$dir" == "$previous_target" ]]; then
      continue
    fi
    if ((kept < KEEP_RELEASES - 2)); then
      kept=$((kept + 1))
      continue
    fi
    rm -rf "$dir"
  done
}

if [[ "${1:-}" == "--rollback" ]]; then
  rollback
  exit
fi
if (($# > 0)); then
  echo "usage: $0 [--rollback]" >&2
  exit 2
fi

mkdir -p "$RELEASES"
BUILD_STAMP="$(date +%Y-%m-%d-%H%M%S)"
FULL_COMMIT="$(git rev-parse --verify HEAD)"
SHORT_COMMIT="${FULL_COMMIT:0:7}"
TREE_STATE="clean"
if [[ -n "$(git status --porcelain --untracked-files=normal)" ]]; then
  TREE_STATE="dirty"
fi
SOURCE_DIGEST="$(node "$PROVENANCE" source-digest "$ROOT")"
[[ "$SOURCE_DIGEST" =~ ^[0-9a-f]{64}$ ]] || { echo "invalid source digest" >&2; exit 1; }
STAGING="$RELEASES/.staging-${BUILD_STAMP}-${SHORT_COMMIT}-$$"
VERSION=""
FINAL=""
OLD_TARGET=""
PREVIOUS_TARGET=""
PREVIOUS_EXISTED=0
CUTOVER_STARTED=0
CUTOVER_COMMITTED=0
FINAL_CREATED=0

cleanup() {
  if [[ "$CUTOVER_STARTED" == "1" && "$CUTOVER_COMMITTED" == "0" ]]; then
    if [[ -n "$OLD_TARGET" && -d "$OLD_TARGET" ]]; then
      atomic_link "$OLD_TARGET" "$LIVE" || true
    fi
    if [[ "$PREVIOUS_EXISTED" == "1" && -n "$PREVIOUS_TARGET" && -d "$PREVIOUS_TARGET" ]]; then
      atomic_link "$PREVIOUS_TARGET" "$PREVIOUS" || true
    else
      rm -f "$PREVIOUS"
    fi
  fi
  if [[ "$FINAL_CREATED" == "1" && "$CUTOVER_COMMITTED" == "0" ]]; then
    rm -rf "$FINAL"
  fi
  rm -rf "$STAGING"
  rm -f "${LIVE}.next.$$" "${PREVIOUS}.next.$$"
}
trap cleanup EXIT

pnpm exec vite build --outDir "$STAGING" --emptyOutDir
BUILT_SOURCE_DIGEST="$(node "$PROVENANCE" source-digest "$ROOT")"
if [[ "$BUILT_SOURCE_DIGEST" != "$SOURCE_DIGEST" ]]; then
  echo "source changed during build; refusing to publish mixed provenance" >&2
  exit 1
fi
ARTIFACT_DIGEST="$(node "$PROVENANCE" digest "$STAGING")"
[[ "$ARTIFACT_DIGEST" =~ ^[0-9a-f]{64}$ ]] || { echo "invalid artifact digest" >&2; exit 1; }
VERSION="${BUILD_STAMP}-darkbear-${SHORT_COMMIT}-${TREE_STATE}-${ARTIFACT_DIGEST:0:12}"
FINAL="$RELEASES/$VERSION"
BUILT_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
PNPM_VERSION="$(pnpm --version)"
VITE_VERSION="$(node -p "require('./node_modules/vite/package.json').version")"
test ! -e "$FINAL" || { echo "release already exists: $FINAL" >&2; exit 1; }
node scripts/stamp-release.mjs "$STAGING" "$VERSION"
node "$PROVENANCE" write "$STAGING" "$VERSION" "$FULL_COMMIT" "$TREE_STATE" "$SOURCE_DIGEST" "$ARTIFACT_DIGEST" "$BUILT_AT" "$PNPM_VERSION" "$VITE_VERSION"
verify_release "$STAGING" "$VERSION"
FINAL_CREATED=1
mv "$STAGING" "$FINAL"

if [[ -L "$LIVE" ]]; then
  OLD_TARGET="$(readlink -f "$LIVE")"
elif [[ -d "$ROOT/out" ]]; then
  # One-time migration: nginx used to serve out/ directly. Keep that exact
  # build as the first rollback target while current/ becomes the live pointer.
  OLD_TARGET="$ROOT/out"
else
  echo "cannot deploy: neither current nor the legacy out directory exists" >&2
  exit 1
fi

if [[ -L "$PREVIOUS" ]]; then
  PREVIOUS_TARGET="$(readlink -f "$PREVIOUS")"
  PREVIOUS_EXISTED=1
elif [[ -e "$PREVIOUS" ]]; then
  echo "cannot deploy: $PREVIOUS exists but is not a symlink" >&2
  exit 1
fi

CUTOVER_STARTED=1
atomic_link "$OLD_TARGET" "$PREVIOUS"
atomic_link "$FINAL" "$LIVE"

if ! verify_public "$VERSION" "$FINAL/release.json"; then
  echo "postflight failed; restoring $OLD_TARGET" >&2
  exit 1
fi

CUTOVER_COMMITTED=1
prune_releases
echo "deployed $VERSION -> $FINAL"
echo "rollback: ./deploy.sh --rollback"
