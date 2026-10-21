#!/bin/zsh
set -eu
cd "$(dirname "$0")/../.."
node -e 'const [a,b]=process.versions.node.split(".").map(Number);if(a<22||(a===22&&b<12)){console.error("Roadster needs Node.js 22.12 or newer.");process.exit(1)}'
if [[ ! -d node_modules ]]; then npm ci; fi
printf 'Local provisional preview: http://127.0.0.1:5486/preview.html\n'
exec npm run dev -- --host 127.0.0.1 --port 5486 --strictPort
