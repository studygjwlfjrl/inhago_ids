# 📍 인하고 (InhaGo)

> **"실시간 위치기반 서비스로 더 즐겁고 새로워지는 인하 라이프!"**  
> 인하대학교 학생들을 실시간 GPS 기반 지도로 연결하여 밥약, 택시팟, 운동, 스터디 등 일상 속 모임을 쉽고 재미있게 만들어주는 캠퍼스 커뮤니티 플랫폼입니다.

---

## 📖 목차
1. [프로젝트 소개](#-프로젝트-소개)
2. [핵심 기능](#-핵심-기능)
3. [기술 스택](#-기술-스택)
4. [프로젝트 구조](#-프로젝트-구조)
5. [데이터베이스 설계 (ERD 요약)](#-데이터베이스-설계-erd-요약)
6. [시작 가이드 (Getting Started)](#-시작-가이드-getting-started)
7. [팀원 및 역할 분담](#-팀원-및-역할-분담)

---

## 💡 프로젝트 소개

### 1. 기획 배경 및 해결 과제
- **문제점**: 공강 시간 밥친구나 운동 파트너를 찾기 어렵고, 심야 시간대 야간 할증 택시비 부담이 큼에도 즉흥적으로 함께할 학우를 구하기 어려움
- **해결 방안**: 실시간 위치(GPS)를 기반으로 캠퍼스 지도 위에 직관적인 카테고리별 마커(스팟)를 띄워, 약속 및 이동의 번거로움을 줄이고 게임처럼 즐겁게 학우들과 연결되는 장을 제공

### 2. 타깃 사용자
- 인하대학교 재학생 (@inha.edu / @inha.ac.kr 인증 사용자)

---

## 🚀 핵심 기능

| 분류 | 기능명 | 설명 | 중요도 |
| :--- | :--- | :--- | :---: |
| **지도/위치** | **캠퍼스 실시간 맵 & 마커** | 브라우저 Geolocation 기반 내 위치 표시 및 주변 모임(밥약/택시팟/운동/스터디) 마커 렌더링 | ★★★★★ |
| **모임/스팟** | **인하고 스팟 모집/참여** | 지도 위 특정 좌표에 밥약, 운동, 스터디 모집글 생성 및 인원 마감 처리 | ★★★★☆ |
| **교통/공유** | **심야 택시 팟** | 거점(주안역, 송도 등) 기반 심야 동승자 모집 및 N분의 1 정산 지원 | ★★★★☆ |
| **소통** | **실시간 채팅 & 1:1 쪽지** | 파티원 간 WebSocket 실시간 그룹 대화 및 프로필 기반 단발성 쪽지 발송 | ★★★☆☆ |
| **네트워킹** | **친구 관리** | 학번/닉네임 검색을 통한 친구 요청/수락 및 친구 상태 조회 | ★★★☆☆ |
| **인증/신뢰** | **학생 인증 & 매너 온도** | 학교 웹메일(UnivCert) 인증 및 약속 이행도 기반 매너 점수(인덕이 표정) 시스템 | ★★★☆☆ |

---

## 🛠 기술 스택

### Frontend
- **Framework & Core**: React 18, TypeScript, Vite
- **State Management**: TanStack Query v5, Zustand
- **Styling**: Tailwind CSS, Lucide React (아이콘)
- **Map & Realtime**: Naver Maps JavaScript API v3, Socket.io-client

### Backend & Database
- **Server Framework**: Node.js (Express.js) 또는 Python (FastAPI)
- **Real-time Server**: Socket.io (실시간 채팅 및 위치 이벤트 동기화)
- **Database**: Supabase (PostgreSQL + PostGIS 공간 쿼리 확장)
- **Authentication**: UnivCert API (학교 웹메일 인증), JWT, bcrypt

### Infrastructure & Deployment
- **Frontend Hosting**: Vercel
- **Backend Hosting**: Render
- **CI/CD & 협업**: GitHub Actions, Git/GitHub

---

## 📂 프로젝트 구조

```text
inhago/
├── frontend/             # 클라이언트 (Vite + React / HTML)
│   ├── index.html        # 메인 진입점
│   ├── pages/            # 화면 단위 (map, post, message, mypage, login)
│   ├── css/              # 스타일시트 (style.css / Tailwind)
│   ├── js/ (src/)        # 프론트엔드 비즈니스 로직
│   └── assets/           # 아이콘 및 인하대/인덕이 리소스
├── backend/              # 서버 애플리케이션
│   ├── app.py / index.js # 서버 메인 실행 파일
│   ├── routes/           # 기능별 라우터 (users, posts, messages, locations, friends)
│   └── services/         # 비즈니스 로직 및 외부 API 연동
├── .env.example          # 환경변수 예시 파일
├── .gitignore            # Git 제외 설정 파일
└── README.md             # 프로젝트 소개 문서
