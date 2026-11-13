
/* ========================================
   1. 초기 모임 데이터
======================================== */

const seed = [
  {
    id: 0,
    title: "본관 근처에서 밥 먹을 사람!",
    type: "food",
    place: "본관 학생식당",
    desc: "점심 같이 먹어요! 편하게 참여해 주세요.",
    count: 3,
    max: 4,
    distance: "320m"
  },
  {
    id: 1,
    title: "농구 한 판 할 사람?",
    type: "exercise",
    place: "체육관",
    desc: "가볍게 농구할 친구를 찾습니다.",
    count: 2,
    max: 4,
    distance: "500m"
  },
  {
    id: 2,
    title: "중간고사 스터디 구해요",
    type: "study",
    place: "정석학술정보관",
    desc: "함께 공부해요!",
    count: 4,
    max: 6,
    distance: "750m"
  },
  {
    id: 3,
    title: "막차 택시팟 구해요",
    type: "taxi",
    place: "인하대역",
    desc: "택시 같이 타고 비용 나눠요.",
    count: 2,
    max: 4,
    distance: "1.2km"
  }
];


/* ========================================
   2. 모임 종류별 Lucide 아이콘
======================================== */

const icons = {
  food: "utensils",
  exercise: "dumbbell",
  study: "book-open",
  taxi: "car-front"
};

// 모임 종류에 해당하는 Lucide 아이콘 HTML
function meetingIcon(type) {
  const iconName = icons[type] || "users";

  return `<i data-lucide="${iconName}"></i>`;
}

// 동적으로 생성된 아이콘을 SVG로 변환
function refreshIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}


/* ========================================
   3. 로컬 저장 데이터
======================================== */

const key = "inhago_step3_demo_v2";

let state;

try {
  state = JSON.parse(localStorage.getItem(key));
} catch (error) {
  console.warn("저장된 모임 데이터를 읽지 못했습니다.", error);
}

if (!state || !Array.isArray(state.meetings)) {
  state = {
    meetings: seed,
    joined: [],
    reviews: [],
    score: 92,
    created: 0
  };
}

// 데이터 저장
function save() {
  localStorage.setItem(key, JSON.stringify(state));
}

// ID로 HTML 요소 찾기
const $ = (id) => document.getElementById(id);

// 현재 선택한 모임
let selected = 0;


/* ========================================
   4. 공통 기능
======================================== */

// 알림 메시지
function toast(message) {
  const toastElement = $("toast");

  toastElement.textContent = message;
  toastElement.style.display = "block";

  setTimeout(() => {
    toastElement.style.display = "none";
  }, 2600);
}

// HTML 특수문자 처리
function esc(value) {
  return String(value).replace(
    /[&<>"']/g,
    (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[character])
  );
}


/* ========================================
   5. 화면 전환
======================================== */

function show(page) {
  // 모든 페이지 숨기기
  document.querySelectorAll(".page").forEach((element) => {
    element.classList.remove("active");
  });

  // 페이지 이름과 실제 ID 연결
  const pageIds = {
    home: "home",
    search: "search-page",
    create: "create-page",
    message: "message-page",
    chat: "chat-page",
    friend: "friend-page",
    profile: "profile-page"
  };

  const targetId = pageIds[page] || "home";
  const targetPage = $(targetId);

  if (targetPage) {
    targetPage.classList.add("active");
  }

  // 하단 메뉴 활성화
  document.querySelectorAll(".sidebar button").forEach((button) => {
    button.classList.toggle(
      "active",
      button.dataset.page === page
    );
  });

  // 화면별 추가 작업
  if (page === "profile") {
    renderProfile();
  }

  if (page === "search") {
    renderSearch();
  }
}

// 메뉴 클릭 이벤트
document.querySelectorAll("[data-page]").forEach((button) => {
  button.addEventListener("click", (event) => {
    event.preventDefault();
    show(button.dataset.page);
  });
});


/* ========================================
   6. 모임 목록 HTML 생성
======================================== */

function meetingHtml(meeting) {
  return `
    <div
      class="meeting"
      data-open="${meeting.id}"
      tabindex="0"
      role="button"
    >
      <span class="meeting-icon ${meeting.type}">
        ${meetingIcon(meeting.type)}
      </span>

      <div class="meeting-info">
        <strong>${esc(meeting.title)}</strong>

        <p>
          ${esc(meeting.place)} · ${esc(meeting.distance)}
        </p>

        <small>
          ${meeting.count}/${meeting.max}명 참여 · 자세히 보기 →
        </small>
      </div>
    </div>
  `;
}


/* ========================================
   7. 주변 모임 목록 출력
======================================== */

function renderCards() {
  $("cards").innerHTML = state.meetings
    .map(meetingHtml)
    .join("");

  // 검색 목록도 갱신
  renderSearch();

  // 새로 생성한 Lucide 아이콘 적용
  refreshIcons();
}


/* ========================================
   8. 모임 검색
======================================== */

function renderSearch() {
  const query = $("search").value
    .trim()
    .toLowerCase();

  const filteredMeetings = state.meetings.filter((meeting) => {
    const searchText = [
      meeting.title,
      meeting.place,
      meeting.desc
    ]
      .join(" ")
      .toLowerCase();

    return searchText.includes(query);
  });

  $("search-results").innerHTML =
    filteredMeetings.map(meetingHtml).join("") ||
    '<p class="muted">검색 결과가 없습니다.</p>';

  refreshIcons();
}


/* ========================================
   9. 모임 상세 보기
======================================== */

function openMeeting(id) {
  const meeting = state.meetings.find(
    (item) => item.id === id
  );

  if (!meeting) return;

  selected = id;

  // 모임 종류별 아이콘
  const modalIcon = $("modal-icon");

  modalIcon.className = `modal-icon meeting-icon ${meeting.type}`;
  modalIcon.innerHTML = meetingIcon(meeting.type);

  $("modal-title").textContent = meeting.title;

  $("modal-place").textContent =
    "📍 " + meeting.place + " · " + meeting.distance;

  $("modal-desc").textContent = meeting.desc;

  $("modal-count").textContent =
    `참여 인원 ${meeting.count}/${meeting.max}명`;

  // 참여 상태에 따른 버튼 변경
  const alreadyJoined = state.joined.includes(id);
  const isFull = meeting.count >= meeting.max;

  $("join").textContent = alreadyJoined
    ? "참여 완료"
    : isFull
      ? "모집 마감"
      : "참여하기";

  $("join").disabled = alreadyJoined || isFull;

  // 아이콘 변환 후 모달 열기
  refreshIcons();
  $("modal").showModal();
}


/* ========================================
   10. 모임 클릭 이벤트
======================================== */

// 주변 모임 / 지도 핀 클릭
document.addEventListener("click", (event) => {
  const target = event.target.closest(
    "[data-open], [data-id]"
  );

  if (!target) return;

  const id = Number(
    target.dataset.open ?? target.dataset.id
  );

  openMeeting(id);
});

// 키보드 Enter로 모임 열기
document.addEventListener("keydown", (event) => {
  if (
    event.key === "Enter" &&
    event.target.matches("[data-open]")
  ) {
    openMeeting(Number(event.target.dataset.open));
  }
});

// 모달 닫기
$("close-modal").onclick = () => {
  $("modal").close();
};


/* ========================================
   11. 모임 참여하기
======================================== */

$("join").onclick = () => {
  const meeting = state.meetings.find(
    (item) => item.id === selected
  );

  if (!meeting) return;

  if (meeting.count >= meeting.max) return;

  if (state.joined.includes(selected)) return;

  // 참여 인원 증가
  meeting.count++;

  // 참여한 모임 저장
  state.joined.push(selected);

  save();
  renderCards();

  $("modal").close();

  toast(
    "모임에 참여했어요! 프로필에서 후기를 남길 수 있어요."
  );
};


/* ========================================
   12. 검색창 입력 이벤트
======================================== */

$("search").addEventListener("input", () => {
  show("search");
  renderSearch();
});


/* ========================================
   13. 새로운 모임 만들기
======================================== */

$("create-form").addEventListener("submit", (event) => {
  event.preventDefault();

  const form = new FormData(event.target);

  const meeting = {
    id: Date.now(),
    title: form.get("title").trim(),
    type: form.get("type"),
    place: form.get("place").trim(),
    desc: form.get("desc").trim() ||
      "새로 등록된 모임입니다.",
    count: 1,
    max: Number(form.get("max")),
    distance: "캠퍼스"
  };

  // 필수 입력 확인
  if (!meeting.title || !meeting.place) {
    return;
  }

  // 모임 목록에 추가
  state.meetings.unshift(meeting);

  // 생성한 모임 수 증가
  state.created++;

  save();

  // 입력 폼 초기화
  event.target.reset();

  // 주변 모임 목록 갱신
  renderCards();

  // 홈 화면으로 이동
  show("home");

  toast(
    "새 모임이 등록되었습니다 (이 브라우저에서만 표시)."
  );
});


/* ========================================
   14. 마이페이지 정보 출력
======================================== */

function renderProfile() {
  // 매너 점수
  $("score").textContent = state.score;
  $("header-score").textContent = state.score;

  $("aside-score").textContent =
    state.score + " / 100";

  $("score-bar").style.width =
    state.score + "%";

  // 점수별 안내 문구
  $("score-label").textContent =
    state.score >= 90
      ? "좋은 매너를 유지하고 있어요!"
      : state.score >= 70
        ? "서로 배려하는 캠퍼스를 만들어요!"
        : "약속과 소통을 더 신경 써 주세요.";

  // 참여 / 작성 / 후기 개수
  $("joined-count").textContent =
    state.joined.length;

  $("created-count").textContent =
    state.created;

  $("review-count").textContent =
    state.reviews.length;

  // 후기 작성 가능한 모임
  const availableMeetings = state.meetings.filter(
    (meeting) =>
      state.joined.includes(meeting.id) &&
      !state.reviews.includes(meeting.id)
  );

  $("review-meeting").innerHTML =
    availableMeetings
      .map(
        (meeting) =>
          `<option value="${meeting.id}">
            ${esc(meeting.title)}
          </option>`
      )
      .join("") ||
    '<option value="">후기를 남길 참여 모임이 없습니다</option>';

  // 후기 작성 가능 여부
  $("review-form").querySelector("button").disabled =
    !availableMeetings.length;
}


/* ========================================
   15. 모임 후기 제출
======================================== */

$("review-form").addEventListener("submit", (event) => {
  event.preventDefault();

  const id = Number($("review-meeting").value);

  if (!state.joined.includes(id)) return;

  if (state.reviews.includes(id)) return;

  // 점수 계산
  const reviewScore = Number($("review-type").value);

  state.score = Math.max(
    0,
    Math.min(100, state.score + reviewScore)
  );

  state.reviews.push(id);

  save();
  renderProfile();

  toast(
    "후기가 반영되었어요. 현재 점수는 시연용입니다."
  );
});


/* ========================================
   16. 시연 데이터 초기화
======================================== */

$("reset-demo").onclick = () => {
  const confirmed = confirm(
    "시연 데이터를 초기화할까요?"
  );

  if (!confirmed) return;

  localStorage.removeItem(key);
  location.reload();
};


/* ========================================
   17. 최초 화면 렌더링
======================================== */

renderCards();
renderProfile();
