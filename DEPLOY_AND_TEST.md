# InhaGo 통합 테스트 및 배포 안내

## 로컬 실행

1. 프로젝트 최신화: `git pull origin feature/ids-full-integration`
2. 백엔드: `cd backend && python -m uvicorn main:app --reload` (가상환경 활성화 후)
3. 프론트엔드: 기존 로컬 정적 웹 서버로 `InhaGo_Design/frontend/index.html` 열기. 루트 경로에 `map/` 폴더도 접근 가능해야 함.
4. `http://127.0.0.1:8000/` 에서 `status: ok` 확인.
5. Google 로그인 후 프로필에서 이름 저장.

## 모임 관리 테스트

- 미래 시간으로 모임 등록. 위도/경도를 입력한 경우에만 지도에 마커가 표시됨.
- 마이페이지 > 내 모임 관리에서 모임 수정.
- 다른 계정으로 모임 참여 후 탈퇴.
- 모임장 계정에서 모임 취소.
- **완료 처리**는 모임 예정 시간이 지난 뒤에만 가능. 지난 모임은 홈 목록에서 제외되지만 마이페이지 내 모임 관리에서 확인 가능.
- 모임 완료 후 프로필에서 참여자 평가. 평가 기능은 Supabase의 `manner_reviews` 테이블, RLS 정책 및 점수 갱신 로직에 의존함. 점수가 실제 변경되는지 별도 검증 필요.
- 지도는 `meetings.latitude`, `meetings.longitude` 값이 있는 모임만 표시. 현재 위치를 사용자가 허용해야 GPS가 동작함.

## 채팅·친구

- 모임 채팅은 `chat_messages` Supabase Realtime 구독을 사용함. 두 계정으로 송수신 확인.
- 친구 기능에는 실제 Supabase `friendships` 로직과 기존 데모 코드가 혼재해 있음. 운영 전 데모 부분 제거 및 RLS 검증 필요.
- 서로 다른 두 계정에서 친구 요청, 수락, 1:1 메시지 송수신 테스트.

## 배포 준비 (아직 배포되지 않음)

### Render (FastAPI)

- Repository: `studygjwlfjrl/inhago_ids`, branch `feature/ids-full-integration`
- Root Directory: `backend`
- Build Command: `pip install -r requirements.txt`
- Start Command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
- 환경 변수: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `FRONTEND_ORIGINS` (예: `https://your-project.vercel.app`)
- Supabase service role key는 프론트엔드에 절대 넣지 않기.

### Vercel (정적 프론트엔드)

- 프로젝트의 현재 프론트엔드는 `InhaGo_Design/frontend`에 있고 지도 스크립트는 루트 `map/`에 있어, 정적 배포 시 두 디렉터리의 URL 경로를 함께 보존해야 함. 단순히 frontend 폴더만 배포하면 지도 스크립트가 404가 될 수 있음.
- 프론트엔드에서 `window.INHAGO_API_BASE`를 Render의 HTTPS URL로 지정해야 함. 이 설정은 `js/meetings-api.js`가 로드되기 전에 실행되어야 함.
- Supabase Auth > URL Configuration에 배포 도메인을 허용하고 Google OAuth redirect URL을 확인.
- `map/config.js`는 GitHub에 없는 로컬 설정 파일이므로, 배포 시 Google Maps 브라우저 키(HTTP referrer 제한 적용)를 별도 구성해야 함.
- 공개 도메인에서 브라우저 콘솔의 CORS, 404, 401 오류 확인.
- 배포 전 Supabase RLS 정책을 검토하고 공개 가능한 데이터 범위를 확인.

## 아직 확인하지 않은 사항

실제 Supabase DB 마이그레이션/RLS, Google Maps API 키, Render/Vercel 프로젝트 생성, 실사용자 브라우저 E2E 테스트는 이 코드 변경만으로 자동 완료되지 않음.
