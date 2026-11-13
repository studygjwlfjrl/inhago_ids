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
if ! "$PYTHON" -c "import socket; s=socket.socket(); s.bind(('127.0.0.1',8000)); s.close()" >/dev/null 2>&1; then
  echo "8000 포트를 이미 사용 중입니다. 기존 FastAPI를 종료하고 다시 실행하세요."
  exit 1
fi
if ! "$PYTHON" -c "import socket; s=socket.socket(); s.bind(('127.0.0.1',5500)); s.close()" >/dev/null 2>&1; then
  echo "5500 포트를 이미 사용 중입니다. 기존 프론트엔드 서버를 종료하고 다시 실행하세요."
  exit 1
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
(cd "$FRONTEND" && exec "$PYTHON" -m http.server 5500 --bind 127.0.0.1) &
FRONT_PID=$!
echo "InhaGo 개발 서버 실행"
echo "프론트엔드: http://127.0.0.1:5500"
echo "백엔드:    http://127.0.0.1:8000/docs"
echo "종료: Control + C"
wait -n "$BACK_PID" "$FRONT_PID" 2>/dev/null || wait "$BACK_PID"
