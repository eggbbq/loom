#!/usr/bin/env bash
set -euo pipefail

kits_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$kits_root"

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
    echo "Node.js 20+ and npm are required." >&2
    exit 1
fi

# Install the locked development dependencies, including when NODE_ENV=production.
npm ci --include=dev
npm run build -- "$@"
