#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/dist"
: "${GOOGLE_MAPS_API_KEY:?Set GOOGLE_MAPS_API_KEY to a browser-restricted Google Maps key}"
rm -rf "$OUT"
mkdir -p "$OUT/InhaGo_Design" "$OUT/map"
cp -R "$ROOT/InhaGo_Design/frontend" "$OUT/InhaGo_Design/frontend"
cp "$ROOT/map/map.js" "$ROOT/map/map.css" "$ROOT/map/index.html" "$OUT/map/"
python3 - "$OUT" <<'PY'
import json, os, pathlib, sys
out = pathlib.Path(sys.argv[1])
(out / "map/config.js").write_text("window.MAP_CONFIG = { apiKey: " + json.dumps(os.environ["GOOGLE_MAPS_API_KEY"]) + " };\n")
(out / "index.html").write_text('<!doctype html><html lang="ko"><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=/InhaGo_Design/frontend/"><title>InhaGo</title><a href="/InhaGo_Design/frontend/">InhaGo 열기</a></html>')
PY
echo "Built Supabase-first static site in $OUT"
