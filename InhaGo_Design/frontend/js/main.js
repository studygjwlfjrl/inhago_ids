
/* =========================================
   InhaGo - Frontend Demo v3
   feature/design
   ========================================= */

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

const categoryIcons = {
  food: "utensils",
  exercise: "dumbbell",
  study: "book-open",
  taxi: "car-front"
};

const categoryEmoji = {
  food: "🍚",
  exercise: "🏀",
  study: "📚",
  taxi: "🚕"
};

const storageKey = "inhago_step3_demo_v2";

const $ = (id) => document.getElementById(id);

let state;

try {
  state = JSON.parse(localStorage.getItem(storageKey));
} catch (error) {
  state = null;
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

state.joined ??= [];
state.reviews ??= [];
state.score ??= 92;
state.created ??= 0;

let selectedMeeting = null;
let activeCategory = "all";
let toastTimer = null;

/* ---------- Utilities ---------- */

function save() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };

    return entities[char];
  });
}

function refreshIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function toast(message) {
  const element = $("toast");

  element.textContent = message;
  element.style.display = "block";

  clearTimeout(toastTimer);

  toastTimer = setTimeout(() => {
    element.style.display = "none";
  }, 2600);
}

/* ---------- Navigation ---------- */

function show(page) {
  const pageIds = {
    home: "home",
    search: "search-page",
    create: "create-page",
    chat: "chat-page",
    message: "message-page",
    friend: "friend-page",
    profile: "profile-page"
  };

  const targetId = pageIds[page] || "home";

  document.querySelectorAll(".page").forEach((element) => {
    element.classList.toggle(
      "active",
      element.id === targetId
    );
  });

  // 홈과 탐색에서만 검색창과 카테고리 표시
  const showFilters = page === "home" || page === "search";
  const hero = $("hero");

  hero.hidden = !showFilters;
  hero.classList.toggle("search-mode", page === "search");

  // 하단 메뉴 활성화
  const selectedPage = page === "message" ? "chat" : page;

  document.querySelectorAll(".nav-item").forEach((button) => {
    button.classList.toggle(
      "active",
      button.dataset.page === selectedPage
    );
  });

  if (page === "profile") {
    renderProfile();
  }

  if (page === "search") {
    renderSearch();
  }

  window.scrollTo({
    top: 0,
    behavior: "auto"
  });
}

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-page]");

  if (!button) return;

  event.preventDefault();
  show(button.dataset.page);
});

/* ---------- Meeting Cards ---------- */

function meetingHTML(meeting) {
  const icon = categoryIcons[meeting.type] || "users";

  return `
    <div
      class="meeting"
      data-open="${meeting.id}"
      role="button"
      tabindex="0"
    >
      <span class="meeting-icon ${escapeHTML(meeting.type)}">
        <i data-lucide="${icon}"></i>
      </span>

      <div class="meeting-info">
        <strong>${escapeHTML(meeting.title)}</strong>

        <p>
          <i data-lucide="map-pin"></i>
          ${escapeHTML(meeting.place)} ·
          ${escapeHTML(meeting.distance)}
        </p>

        <small>
          <i data-lucide="users-round"></i>
          ${meeting.count}/${meeting.max}명 참여
        </small>
      </div>

      <i
        class="meeting-arrow"
        data-lucide="chevron-right"
      ></i>
    </div>
  `;
}

function filteredMeetings(query = "") {
  const normalizedQuery = query.trim().toLowerCase();

  return state.meetings.filter((meeting) => {
    const categoryMatches =
      activeCategory === "all" ||
      meeting.type === activeCategory;

    const searchableText = [
      meeting.title,
      meeting.place,
      meeting.desc
    ].join(" ").toLowerCase();

    return (
      categoryMatches &&
      searchableText.includes(normalizedQuery)
    );
  });
}

function renderCards() {
  const meetings = filteredMeetings();

  $("cards").innerHTML = meetings.length
    ? meetings.map(meetingHTML).join("")
    : '<p class="muted">해당 카테고리의 모임이 없습니다.</p>';

  $("meeting-total").textContent = `${meetings.length}개`;

  renderSearch();
  refreshIcons();
}

/* ---------- Category Filter ---------- */

document.querySelectorAll(".category-chip").forEach((button) => {
  button.addEventListener("click", () => {
    activeCategory = button.dataset.category;

    document.querySelectorAll(".category-chip").forEach((chip) => {
      chip.classList.toggle(
        "active",
        chip.dataset.category === activeCategory
      );
    });

    renderCards();
  });
});

/* ---------- Search ---------- */

function renderSearch() {
  const query = $("search").value;
  const results = filteredMeetings(query);

  $("search-results").innerHTML = results.length
    ? results.map(meetingHTML).join("")
    : '<p class="muted">검색 결과가 없습니다.</p>';

  refreshIcons();
}

$("search").addEventListener("input", () => {
  show("search");
  renderSearch();
});

/* ---------- Meeting Modal ---------- */

function openMeeting(id) {
  const meeting = state.meetings.find((item) => item.id === id);

  if (!meeting) return;

  selectedMeeting = id;

  $("modal-icon").textContent =
    categoryEmoji[meeting.type] || "📍";

  $("modal-title").textContent = meeting.title;

  $("modal-place").textContent =
    `📍 ${meeting.place} · ${meeting.distance}`;

  $("modal-desc").textContent = meeting.desc;

  $("modal-count").textContent =
    `참여 인원 ${meeting.count}/${meeting.max}명`;

  const alreadyJoined = state.joined.includes(id);
  const isFull = meeting.count >= meeting.max;

  $("join").textContent = alreadyJoined
    ? "참여 완료"
    : isFull
      ? "모집 마감"
      : "참여하기";

  $("join").disabled = alreadyJoined || isFull;

  $("modal").showModal();
}

document.addEventListener("click", (event) => {
  const target = event.target.closest("[data-open], [data-id]");

  if (!target) return;

  const id = Number(target.dataset.open ?? target.dataset.id);

  openMeeting(id);
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;

  const target = event.target.closest("[data-open]");

  if (target) {
    openMeeting(Number(target.dataset.open));
  }
});

$("close-modal").addEventListener("click", () => {
  $("modal").close();
});

/* ---------- Join Meeting ---------- */

$("join").addEventListener("click", () => {
  const meeting = state.meetings.find(
    (item) => item.id === selectedMeeting
  );

  if (!meeting) return;
  if (meeting.count >= meeting.max) return;
  if (state.joined.includes(selectedMeeting)) return;

  meeting.count += 1;
  state.joined.push(selectedMeeting);

  save();
  renderCards();

  $("modal").close();

  toast("모임에 참여했어요! 프로필에서 후기를 남길 수 있어요.");
});

/* ---------- Create Meeting ---------- */

$("create-form").addEventListener("submit", (event) => {
  event.preventDefault();

  const form = event.target;
  const data = new FormData(form);

  const meeting = {
    id: Date.now(),
    title: String(data.get("title")).trim(),
    type: data.get("type"),
    place: String(data.get("place")).trim(),
    desc: String(data.get("desc")).trim() ||
      "새로 등록된 모임입니다.",
    count: 1,
    max: Number(data.get("max")),
    distance: "캠퍼스"
  };

  if (!meeting.title || !meeting.place) return;

  state.meetings.unshift(meeting);
  state.created += 1;

  save();
  form.reset();

  activeCategory = "all";

  document.querySelectorAll(".category-chip").forEach((chip) => {
    chip.classList.toggle(
      "active",
      chip.dataset.category === "all"
    );
  });

  renderCards();
  show("home");

  toast("새 모임이 등록되었습니다. 현재 브라우저에 저장됩니다.");
});

/* ---------- Profile ---------- */

function renderProfile() {
  $("score").textContent = state.score;
  $("header-score").textContent = state.score;
  $("aside-score").textContent = `${state.score} / 100`;

  $("score-bar").style.width = `${state.score}%`;

  if (state.score >= 90) {
    $("score-label").textContent =
      "좋은 매너를 유지하고 있어요!";
  } else if (state.score >= 70) {
    $("score-label").textContent =
      "서로 배려하는 캠퍼스를 만들어요!";
  } else {
    $("score-label").textContent =
      "약속과 소통을 더 신경 써 주세요.";
  }

  $("joined-count").textContent = state.joined.length;
  $("created-count").textContent = state.created;
  $("review-count").textContent = state.reviews.length;

  const available = state.meetings.filter((meeting) => {
    return (
      state.joined.includes(meeting.id) &&
      !state.reviews.includes(meeting.id)
    );
  });

  $("review-meeting").innerHTML = available.length
    ? available.map((meeting) => `
        <option value="${meeting.id}">
          ${escapeHTML(meeting.title)}
        </option>
      `).join("")
    : '<option value="">후기를 남길 모임이 없습니다.</option>';

  $("review-form").querySelector("button").disabled =
    available.length === 0;
}

/* ---------- Reviews ---------- */

$("review-form").addEventListener("submit", (event) => {
  event.preventDefault();

  const id = Number($("review-meeting").value);

  if (!state.joined.includes(id)) return;
  if (state.reviews.includes(id)) return;

  const change = Number($("review-type").value);

  state.score = Math.max(
    0,
    Math.min(100, state.score + change)
  );

  state.reviews.push(id);

  save();
  renderProfile();

  toast("후기가 반영되었어요. 현재 점수는 시연용입니다.");
});

/* ---------- Reset Demo ---------- */

$("reset-demo").addEventListener("click", () => {
  if (!confirm("시연 데이터를 초기화할까요?")) return;

  localStorage.removeItem(storageKey);
  location.reload();
});

/* ---------- Friend Search ---------- */

const friendSearchInput = $("friend-search-input");
const friendItems = document.querySelectorAll(
  "#friend-list .friend-item"
);
const friendEmpty = $("friend-empty");

friendSearchInput.addEventListener("input", () => {
  const query = friendSearchInput.value.trim().toLowerCase();

  let visibleCount = 0;

  friendItems.forEach((friend) => {
    const name = friend.dataset.friendName.toLowerCase();
    const matches = name.includes(query);

    friend.hidden = !matches;

    if (matches) {
      visibleCount++;
    }
  });

  friendEmpty.hidden = visibleCount !== 0;
});

/* ---------- Demo Buttons ---------- */

$("notification-button").addEventListener("click", () => {
  toast("알림 기능은 서버 연동 후 제공됩니다.");
});

$("locate-button").addEventListener("click", () => {
  toast("현재 지도는 시연용입니다. GPS는 추후 연결됩니다.");
});

/* ---------- Initialize ---------- */

renderCards();
renderProfile();

window.addEventListener("load", refreshIcons);
