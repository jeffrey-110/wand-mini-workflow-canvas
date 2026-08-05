#!/bin/sh
# Project setup: install dependencies and verify the toolchain.
#
# Safe to re-run — every step is idempotent. Run with `pnpm run setup`.

set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$root"

# Bold when attached to a terminal, plain when piped to a log.
if [ -t 1 ]; then
  b=$(printf '\033[1m')
  r=$(printf '\033[0m')
else
  b='' r=''
fi

step() { printf '%s==>%s %s\n' "$b" "$r" "$1"; }

missing=''
for cmd in node pnpm; do
  command -v "$cmd" >/dev/null 2>&1 || missing="$missing $cmd"
done

if [ -n "$missing" ]; then
  printf '%sMissing required tool(s):%s%s\n\n' "$b" "$missing" "$r" >&2
  case "$missing" in *node*) echo '  node  https://nodejs.org  (>=22.6 — for native TypeScript stripping)' >&2 ;; esac
  case "$missing" in *pnpm*) echo '  pnpm  corepack enable pnpm' >&2 ;; esac
  exit 1
fi

# apps/api runs TypeScript directly via --experimental-strip-types, which needs
# 22.6+. Checked here rather than failing with a confusing parse error later.
node -e 'const [j,n]=process.versions.node.split(".").map(Number);
if (j<22 || (j===22 && n<6)) { console.error(`Node ${process.versions.node} is too old — this repo needs >=22.6.`); process.exit(1); }'

step 'Installing dependencies'
pnpm install

printf '\n%sSetup complete.%s\n\n' "$b" "$r"
echo 'Next:'
echo '  pnpm run dev      API on :8787 and the UI on :5173'
echo '  pnpm run verify   the full gate: format, typecheck, tests, build'
