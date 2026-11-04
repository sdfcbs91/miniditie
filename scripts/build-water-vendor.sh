#!/bin/sh
# Optional maintenance step; the checked-in bundle runs offline without Node/npm.
set -eu
ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
npm install --prefix "$TMP" --no-save three@0.160.1 n8ao@1.10.3 postprocessing@6.35.6 esbuild@0.25.12
NODE_PATH="$TMP/node_modules" "$TMP/node_modules/.bin/esbuild" "$ROOT/scripts/water-three-entry.js" --bundle --minify --format=iife --legal-comments=none --outfile="$ROOT/vendor/water-three.min.js"
