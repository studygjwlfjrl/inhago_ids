
import { supabase } from './supabase.js';

// ========================================
// 1. 기존 시연용 모임 데이터
// ========================================

const seed = [
  {
    id: 0,
    title: '본관 근처에서 밥 먹을 사람!',
    type: 'food',
    place: '본관 학생식당',
    desc: '점심 같이 먹어요! 편하게 참여해 주세요.',
    count: 3,
    max: 4,
    distance: '320m'
  },
  {
    id: 1,
    title: '농구 한 판 할 사람?',
    type: 'exercise',
    place: '체육관',
    desc: '가볍게 농구할 친구를 찾습니다.',
    count: 2,
    max: 4,
    distance: '500m'
  },
  {
    id: 2,
    title: '중간고사 스터디 구해요',
    type: 'study',
    place: '정석학술정보관',
    desc: '함께 공부해요!',
    count: 4,
    max: 6,
    distance: '750m'
  },
  {
    id: 3,
    title: '막차 택시팟 구해요',
    type: 'taxi',
    place: '인하대역',
    desc: '택시 같이 타고 비용 나눠요.',
    count: 2,
    max: 4,
    distance: '1.2km'
  }
];

const icons = {
  food: '🍚',
  exercise: '🏀',
  study: '📚',
  taxi: '🚕'
};

const key = 'inhago_step3_demo_v2';

let state;

try {
  state = JSON.parse(localStorage.getItem(key));
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

const save = () => {
  localStorage.setItem(key, JSON.stringify(state));
};

const $ = (id) => document.getElementById(id);

let selected = 0;

// 실제 Supabase 후기 평가용 데이터
let reviewMeetings = [];
let currentReviewUser = null;

// ========================================
// 2. 공통 함수
// ========================================

function esc(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function toast(message) {
  const element = $('toast');

  element.textContent = message;
  element.style.display = 'block';

  setTimeout(() => {
    element.style.display = 'none';
  }, 2600);
}

function show(page) {
  document.querySelectorAll('.page').forEach((element) => {
    element.classList.remove('active');
  });

  const pageIds = {
    home: 'home',
    search: 'search-page',
    create: 'create-page',
    message: 'message-page',
    friend: 'friend-page',
    profile: 'profile-page'
  };

  $(pageIds[page] || 'home').classList.add('active');

  document.querySelectorAll('.sidebar button').forEach((button) => {
    button.classList.toggle(
      'active',
      button.dataset.page === page
    );
  });

  if (page === 'profile') {
    renderProfile();
    loadReviewMeetings();
  }

  if (page === 'search') {
    renderSearch();
  }
}

document.querySelectorAll('[data-page]').forEach((button) => {
  button.addEventListener('click', (event) => {
    event.preventDefault();
    show(button.dataset.page);
  });
});

// ========================================
// 3. 모임 목록 (기존 시연 기능)
// ========================================

function meetingHtml(meeting) {
  return `
    <div
      class="meeting"
      data-open="${meeting.id}"
      tabindex="0"
      role="button"
    >
      <span class="meeting-icon ${meeting.type}">
        ${icons[meeting.type] || '📍'}
      </span>

      <div class="meeting-info">
        <strong>${esc(meeting.title)}</strong>
        <p>
          ${esc(meeting.place)} ·
          ${esc(meeting.distance)}
        </p>
        <small>
          ${meeting.count}/${meeting.max}명 참여 ·
          자세히 보기 →
        </small>
      </div>
    </div>
  `;
}

function renderCards() {
  $('cards').innerHTML =
    state.meetings.map(meetingHtml).join('');

  renderSearch();
}

function renderSearch() {
  const query = $('search').value.trim().toLowerCase();

  const results = state.meetings.filter((meeting) => {
    return [
      meeting.title,
      meeting.place,
      meeting.desc
    ].join(' ').toLowerCase().includes(query);
  });

  $('search-results').innerHTML =
    results.map(meetingHtml).join('') ||
    '<p class="muted">검색 결과가 없습니다.</p>';
}

function openMeeting(id) {
  const meeting = state.meetings.find(
    (item) => item.id === id
  );

  if (!meeting) return;

  selected = id;

  $('modal-icon').textContent =
    icons[meeting.type] || '📍';

  $('modal-title').textContent = meeting.title;

  $('modal-place').textContent =
    '📍 ' + meeting.place + ' · ' + meeting.distance;

  $('modal-desc').textContent = meeting.desc;

  $('modal-count').textContent =
    `참여 인원 ${meeting.count}/${meeting.max}명`;

  const joined = state.joined.includes(id);
  const full = meeting.count >= meeting.max;

  $('join').textContent = joined
    ? '참여 완료'
    : full
    ? '모집 마감'
    : '참여하기';

  $('join').disabled = joined || full;

  $('modal').showModal();
}

document.addEventListener('click', (event) => {
  const target = event.target.closest(
    '[data-open], [data-id]'
  );

  if (!target) return;

  const id = Number(
    target.dataset.open ?? target.dataset.id
  );

  openMeeting(id);
});

document.addEventListener('keydown', (event) => {
  if (
    event.key === 'Enter' &&
    event.target.matches('[data-open]')
  ) {
    openMeeting(Number(event.target.dataset.open));
  }
});

$('close-modal').onclick = () => {
  $('modal').close();
};

$('join').onclick = () => {
  const meeting = state.meetings.find(
    (item) => item.id === selected
  );

  if (!meeting) return;

  if (
    meeting.count >= meeting.max ||
    state.joined.includes(selected)
  ) {
    return;
  }

  meeting.count++;
  state.joined.push(selected);

  save();
  renderCards();

  $('modal').close();

  toast('모임에 참여했어요! (시연용)');
};

$('search').addEventListener('input', () => {
  show('search');
});

// ========================================
// 4. 모임 만들기 (기존 시연 기능)
// ========================================

$('create-form').addEventListener('submit', (event) => {
  event.preventDefault();

  const form = new FormData(event.target);

  const meeting = {
    id: Date.now(),
    title: form.get('title').trim(),
    type: form.get('type'),
    place: form.get('place').trim(),
    desc: form.get('desc').trim() ||
      '새로 등록된 모임입니다.',
    count: 1,
    max: Number(form.get('max')),
    distance: '캠퍼스'
  };

  if (!meeting.title || !meeting.place) return;

  state.meetings.unshift(meeting);
  state.created++;

  save();

  event.target.reset();

  renderCards();
  show('home');

  toast('새 모임이 등록되었습니다. (시연용)');
});

// ========================================
// 5. 마이페이지 매너 점수
// ========================================

function renderProfile() {
  $('score').textContent = state.score;

  $('header-score').textContent = state.score;

  $('aside-score').textContent =
    state.score + ' / 100';

  $('score-bar').style.width =
    state.score + '%';

  $('score-label').textContent =
    state.score >= 90
      ? '좋은 매너를 유지하고 있어요!'
      : state.score >= 70
      ? '서로 배려하는 캠퍼스를 만들어요!'
      : '약속과 소통을 더 신경 써 주세요.';

  $('joined-count').textContent =
    state.joined.length;

  $('created-count').textContent =
    state.created;

  $('review-count').textContent =
    state.reviews.length;
}


 // index.html에서 호출하는 함수
window.setMannerScore = function (score) {
  if (
    !Number.isInteger(score) ||
    score < 0 ||
    score > 100
  ) {
    return;
  }

  // 기존 매너 점수 표시
  state.score = score;
  renderProfile();

  // 매너 점수를 학점으로 변환
  const mannerGrade = getMannerGrade(score);

  // 학점에 맞는 인덕이 이미지 선택
  const induckImage = getInduckImage(mannerGrade);

  // 마이페이지 상단 인덕이 변경
  const profileMascot = document.querySelector(
    '#profile-page .profile-top img'
  );

  if (profileMascot) {
    profileMascot.src = induckImage;
    profileMascot.alt = `${mannerGrade} 학점의 인덕이`;
  }
};


// ========================================
// 6. 실제 Supabase 평가 가능한 모임 조회
// ========================================

async function loadReviewMeetings() {
  const meetingSelect = $('review-meeting');
  const personSelect = $('review-person');
  const message = $('review-message');

  const { data: { user }, error: userError } =
    await supabase.auth.getUser();

  if (userError || !user) {
    message.textContent = '로그인 후 이용할 수 있습니다.';
    return;
  }

  currentReviewUser = user;

  // 내가 joined 상태로 참여한 모임
  const { data: participants, error } = await supabase
    .from('meeting_participants')
    .select('meeting_id')
    .eq('user_id', user.id)
    .eq('status', 'joined');

  if (error) {
    console.error('참여 모임 조회 오류:', error);
    message.textContent = '참여 모임을 불러오지 못했습니다.';
    return;
  }

  const meetingIds = [
    ...new Set(
      (participants || []).map((item) => item.meeting_id)
    )
  ];

  meetingSelect.innerHTML =
    '<option value="">모임을 선택하세요</option>';

  personSelect.innerHTML =
    '<option value="">참여자를 선택하세요</option>';

  reviewMeetings = [];

  if (meetingIds.length === 0) {
    message.textContent = '참여한 모임이 없습니다.';
    return;
  }

  // 완료된 모임만 조회
  const { data: meetings, error: meetingError } =
    await supabase
      .from('meetings')
      .select('id, title, status')
      .in('id', meetingIds)
      .eq('status', 'completed');

  if (meetingError) {
    console.error('완료 모임 조회 오류:', meetingError);
    message.textContent = '완료된 모임을 불러오지 못했습니다.';
    return;
  }

  reviewMeetings = meetings || [];

  for (const meeting of reviewMeetings) {
    const option = document.createElement('option');

    option.value = meeting.id;
    option.textContent = meeting.title;

    meetingSelect.appendChild(option);
  }

  message.textContent = reviewMeetings.length
    ? '평가할 모임을 선택해 주세요.'
    : '아직 평가할 수 있는 완료된 모임이 없습니다.';

  console.log('평가 가능한 모임:', reviewMeetings);
}

// ========================================
// 7. 모임 선택 시 평가 대상 불러오기
// ========================================

async function loadReviewPeople() {
  const meetingId = $('review-meeting').value;
  const personSelect = $('review-person');
  const message = $('review-message');

  personSelect.innerHTML =
    '<option value="">참여자를 선택하세요</option>';

  if (!meetingId || !currentReviewUser) {
    return;
  }

  const { data: members, error } = await supabase
    .from('meeting_participants')
    .select('user_id')
    .eq('meeting_id', meetingId)
    .eq('status', 'joined')
    .neq('user_id', currentReviewUser.id);

  if (error) {
    console.error('참여자 조회 오류:', error);
    message.textContent = '참여자를 불러오지 못했습니다.';
    return;
  }

  // 이미 내가 평가한 사람 조회
  const { data: existingReviews, error: reviewError } =
    await supabase
      .from('manner_reviews')
      .select('reviewee_id')
      .eq('meeting_id', meetingId)
      .eq('reviewer_id', currentReviewUser.id);

  if (reviewError) {
    console.error('기존 후기 조회 오류:', reviewError);
    message.textContent = '기존 평가 내역을 확인하지 못했습니다.';
    return;
  }

  const reviewedIds = new Set(
    (existingReviews || []).map(
      (review) => review.reviewee_id
    )
  );

  const availableMembers = (members || []).filter(
    (member) => !reviewedIds.has(member.user_id)
  );

  // 현재는 사용자 이름 대신 ID 일부 표시
  
// 평가 가능한 참여자들의 실제 이름 조회
const memberIds = availableMembers.map(
  (member) => member.user_id
);

let nameMap = {};

if (memberIds.length > 0) {
  const { data: profiles, error: profileError } =
    await supabase
      .from('profiles')
      .select('id, real_name')
      .in('id', memberIds);

  if (profileError) {
    console.error('참여자 이름 조회 실패:', profileError);
    message.textContent = '참여자 이름을 불러오지 못했습니다.';
    return;
  }

  nameMap = Object.fromEntries(
    (profiles || []).map((profile) => [
      profile.id,
      profile.real_name
    ])
  );
}

// 참여자 선택창에 실제 이름 표시
for (const member of availableMembers) {
  const option = document.createElement('option');

  // 데이터베이스에는 기존 사용자 ID 사용
  option.value = member.user_id;

  // 화면에는 실제 이름 표시
  option.textContent =
    nameMap[member.user_id] ||
    '이름 미설정 (' + member.user_id.slice(0, 8) + ')';

  personSelect.appendChild(option);
}


  message.textContent = availableMembers.length
    ? `${availableMembers.length}명을 평가할 수 있습니다.`
    : '평가할 참여자가 없거나 이미 모두 평가했습니다.';

  console.log('평가 가능한 참여자:', availableMembers);
}

$('review-meeting').addEventListener(
  'change',
  loadReviewPeople
);

// ========================================
// 8. 실제 A+ ~ F 학점 평가 제출
// ========================================

$('review-form').addEventListener(
  'submit',
  async (event) => {
    event.preventDefault();

    const meetingId = $('review-meeting').value;
    const revieweeId = $('review-person').value;
    const grade = $('review-type').value;

    const message = $('review-message');
    const submitButton =
      $('review-form').querySelector('button[type="submit"]');

    if (!currentReviewUser) {
      message.textContent = '로그인이 필요합니다.';
      return;
    }

    if (!meetingId || !revieweeId || !grade) {
      message.textContent =
        '모임, 참여자, 학점을 모두 선택해 주세요.';
      return;
    }

    if (revieweeId === currentReviewUser.id) {
      message.textContent = '자기 자신은 평가할 수 없습니다.';
      return;
    }

    submitButton.disabled = true;
    message.textContent = '평가를 저장하고 있습니다...';

    try {
      const { error } = await supabase
        .from('manner_reviews')
        .insert({
          meeting_id: meetingId,
          reviewer_id: currentReviewUser.id,
          reviewee_id: revieweeId,
          grade: grade
        });

      if (error) {
        throw error;
      }

      message.textContent =
        `${grade} 학점 평가가 저장되었습니다!`;

      toast('학점 평가가 완료되었습니다!');

      // 평가 대상 목록 새로고침
      await loadReviewPeople();

    } catch (error) {
      console.error('학점 평가 저장 오류:', error);

      message.textContent =
        '평가 저장 실패: ' + error.message;
    } finally {
      submitButton.disabled = false;
    }
  }
);

// ========================================
// 9. 초기 실행
// ========================================

renderCards();
renderProfile();
loadReviewMeetings();

 // ========================================
 // 10. 사용자 실제 이름 불러오기 및 저장
 // ========================================

async function loadRealName() {
  const { data: { user }, error: userError } =
    await supabase.auth.getUser();

  if (userError || !user) return;

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('real_name')
    .eq('id', user.id)
    .single();

  if (error) {
    console.error('이름 조회 실패:', error.message);
    return;
  }

  if (profile?.real_name) {
    $('profile-real-name').textContent = profile.real_name;
    $('real-name-input').value = profile.real_name;
  }
}

$('real-name-form').addEventListener('submit', async (event) => {
  event.preventDefault();

  const realName = $('real-name-input').value.trim();
  const message = $('real-name-message');
  const button = $('real-name-form').querySelector('button');

  if (realName.length < 2 || realName.length > 20) {
    message.textContent = '이름은 2~20자로 입력해 주세요.';
    return;
  }

  const { data: { user }, error: userError } =
    await supabase.auth.getUser();

  if (userError || !user) {
    message.textContent = '로그인이 필요합니다.';
    return;
  }

  button.disabled = true;
  message.textContent = '이름을 저장하는 중입니다...';

  const { error } = await supabase
    .from('profiles')
    .update({ real_name: realName })
    .eq('id', user.id);

  button.disabled = false;

  if (error) {
    console.error('이름 저장 실패:', error);
    message.textContent = '저장 실패: ' + error.message;
    return;
  }

  $('profile-real-name').textContent = realName;
  message.textContent = '이름이 저장되었습니다!';
  toast('이름이 저장되었습니다!');
});

loadRealName();

// ========================================
// 매너 점수에 따른 인덕이 이미지 변경
// ========================================

// 매너 점수 → 학점

function getMannerGrade(score) {
  const s = Number(score);

  if (s >= 95) return 'A+';
  if (s >= 84) return 'A0';
  if (s >= 73) return 'B+';
  if (s >= 62) return 'B0';
  if (s >= 50) return 'C+';
  if (s >= 39) return 'C0';
  if (s >= 28) return 'D+';
  if (s >= 11) return 'D0';
  return 'F';
}


// 학점 → 인덕이 이미지 파일
function getInduckImage(grade) {
  const images = {
    'A+': 'induck_Aplus.svg',
    'A0': 'induck_A0.svg',
    'B+': 'induck_Bplus.svg',
    'B0': 'induck_B0.svg',
    'C+': 'induck_Cplus.svg',
    'C0': 'induck_C0.svg',
    'D+': 'induck_Dplus.svg',
    'D0': 'induck_D0.svg',
    'F': 'induck_F.svg'
  };

  return 'assets/' + images[grade];
}

