#!/usr/bin/env bash
# InhaGo local development launcher (macOS/Linux)
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/InhaGo_Design/frontend"
if [[ ! -f "$BACKEND/main.py" || ! -f "$FRONTEND/index.html" ]]; then
  echo "프로젝트 폴더를 찾지 못했습니다."
  exit 1
fi
if [[ ! -f "$BACKEND/.env" ]]; then
  echo "주의: backend/.env가 없습니다. API 환경 변수를 확인하세요."
fi
if [[ -x "$BACKEND/.venv/bin/python" ]]; then
  PYTHON="$BACKEND/.venv/bin/python"
elif command -v python3 >/dev/null 2>&1; then
  PYTHON="$(command -v python3)"
else
  echo "Python 3을 설치해 주세요."
  exit 1
fi
if ! "$PYTHON" -c "import uvicorn, fastapi" >/dev/null 2>&1; then
  echo "FastAPI 의존성이 없습니다. backend 가상환경을 만들고 requirements.txt를 설치하세요."
  exit 1
fi
# Do not pre-bind ports: some macOS Python environments deny the probe even
# when the port is free. Let uvicorn/http.server report actual bind errors.
if command -v lsof >/dev/null 2>&1; then
  for PORT in 8000 5500; do
    if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN | grep -q LISTEN; then
      echo "주의: $PORT 포트에서 이미 서버가 실행 중입니다."
      echo "기존 서버를 종료한 뒤 다시 실행해 주세요."
      exit 1
    fi
  done
fi
cleanup() {
  trap - EXIT INT TERM
  kill "$BACK_PID" "$FRONT_PID" 2>/dev/null || true
  wait "$BACK_PID" "$FRONT_PID" 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
(cd "$BACKEND" && exec "$PYTHON" -m uvicorn main:app --reload --host 127.0.0.1 --port 8000) &
BACK_PID=$!
(cd "$ROOT" && exec "$PYTHON" -m http.server 5500 --bind 127.0.0.1) &
FRONT_PID=$!
echo "InhaGo 개발 서버 실행"
echo "프론트엔드: http://127.0.0.1:5500/InhaGo_Design/frontend/"
echo "백엔드:    http://127.0.0.1:8000/docs"
echo "지도 설정: $ROOT/map/config.js (로컬 파일, Git에 미포함)"
echo "종료: Control + C"
wait "$BACK_PID"
