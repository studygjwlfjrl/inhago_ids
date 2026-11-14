
import { supabase } from "./supabase.js";

// =====================================
// 인하고 단체 채팅 - 속도 개선 버전
// =====================================

const $ = id => document.getElementById(id);

const groupTab = $("group-chat-tab");
const createBtn = $("create-group-chat-btn");
const roomList = $("group-chat-room-list");
const listView = $("group-chat-list-view");
const roomView = $("group-chat-room-view");
const backBtn = $("group-chat-back");
const roomTitle = $("group-chat-room-title");
const messagesEl = $("group-chat-messages");
const form = $("group-chat-form");
const input = $("group-chat-input");
const menuBtn = $("group-chat-menu-btn");

let userId = null;
let activeRoomId = null;
let roomChannel = null;
let listChannel = null;
let menuOverlay = null;
let sending = false;
let roomVersion = 0;
let messageVersion = 0;
let refreshTimer = null;

const displayedIds = new Set();
const senderNames = new Map();
const latestMessages = new Map();
const roomsCache = new Map();
const memberships = new Set();

function element(tag, className = "", text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function displayName(profile) {
  return (
    profile?.nickname ||
    profile?.real_name?.split("/")[0]?.trim() ||
    "이름 미설정"
  );
}

function formatTime(value) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  if (date.toDateString() === new Date().toDateString()) {
    return date.toLocaleTimeString("ko-KR", {
      hour: "numeric",
      minute: "2-digit"
    });
  }

  return date.toLocaleDateString("ko-KR", {
    month: "numeric",
    day: "numeric"
  });
}

async function getUserId() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;

  userId = data?.user?.id || null;
  return userId;
}

async function getProfiles(ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map();

  const { data, error } = await supabase
    .from("profiles")
    .select("id, nickname, real_name")
    .in("id", unique);

  if (error) throw error;

  const result = new Map();

  for (const profile of data || []) {
    result.set(profile.id, displayName(profile));
    senderNames.set(profile.id, displayName(profile));
  }

  return result;
}

// =====================================
// 친구 목록
// =====================================

async function loadFriends() {
  const id = await getUserId();
  if (!id) return [];

  const { data, error } = await supabase
    .from("friendships")
    .select("requester_id, receiver_id")
    .eq("status", "accepted")
    .or(`requester_id.eq.${id},receiver_id.eq.${id}`);

  if (error) throw error;

  const ids = [...new Set(
    (data || []).map(row =>
      row.requester_id === id
        ? row.receiver_id
        : row.requester_id
    )
  )];

  const names = await getProfiles(ids);

  return ids.map(friendId => ({
    id: friendId,
    name: names.get(friendId) || "이름 미설정"
  }));
}

// =====================================
// 메시지 즉시 표시
// =====================================

function appendMessage(message) {
  if (!message?.id) return;
  if (String(message.room_id) !== String(activeRoomId)) return;

  const id = String(message.id);
  if (displayedIds.has(id)) return;

  displayedIds.add(id);

  messagesEl.querySelectorAll(".group-chat-empty")
    .forEach(el => el.remove());

  const mine = message.sender_id === userId;

  const item = element("div");
  item.dataset.messageId = id;

  item.style.cssText = `
    padding:10px;
    margin:8px 0;
    border-radius:10px;
    background:${mine ? "#dceaff" : "#f1f1f1"};
    color:#222;
    text-align:${mine ? "right" : "left"};
    overflow-wrap:anywhere;
  `;

  const sender = element(
    "strong",
    "",
    mine
      ? "나"
      : senderNames.get(message.sender_id) || "이름 확인 중..."
  );

  const content = element("div", "", message.content);
  const time = element("small", "", formatTime(message.created_at));

  time.style.cssText = `
    display:block;
    margin-top:5px;
    font-size:10px;
    opacity:.6;
  `;

  item.append(sender, content, time);
  messagesEl.appendChild(item);

  messagesEl.scrollTop = messagesEl.scrollHeight;

  // 이름 조회 때문에 메시지 표시를 기다리지 않는다.
  if (!mine && !senderNames.has(message.sender_id)) {
    getProfiles([message.sender_id])
      .then(names => {
        if (item.isConnected) {
          sender.textContent =
            names.get(message.sender_id) || "이름 미설정";
        }
      })
      .catch(console.error);
  }
}

// =====================================
// 채팅방 미리보기 즉시 갱신
// =====================================

function updatePreview(message) {
  const roomId = String(message.room_id);

  if (!memberships.has(roomId)) return;

  const previous = latestMessages.get(roomId);

  if (
    previous &&
    new Date(previous.created_at) > new Date(message.created_at)
  ) {
    return;
  }

  latestMessages.set(roomId, message);

  const row = [...roomList.querySelectorAll("[data-room-id]")]
    .find(el => el.dataset.roomId === roomId);

  if (!row) return;

  const preview = row.querySelector(".group-chat-list-preview");
  const time = row.querySelector(".group-chat-list-time");

  if (preview) {
    preview.textContent =
      (message.sender_id === userId ? "나: " : "") +
      message.content;
  }

  if (time) time.textContent = formatTime(message.created_at);

  roomList.prepend(row);
}

function scheduleRefresh() {
  clearTimeout(refreshTimer);

  refreshTimer = setTimeout(() => {
    loadRooms(true);
  }, 350);
}

// =====================================
// 채팅방 목록
// =====================================

async function loadRooms(silent = false) {
  if (!roomList) return;

  const version = ++roomVersion;

  if (!silent && !roomList.children.length) {
    roomList.textContent = "채팅방을 불러오는 중...";
  }

  try {
    const id = await getUserId();

    if (version !== roomVersion) return;

    if (!id) {
      roomList.textContent = "로그인이 필요합니다.";
      return;
    }

    const { data: memberRows, error: memberError } =
      await supabase
        .from("group_chat_members")
        .select("room_id")
        .eq("user_id", id);

    if (memberError) throw memberError;

    const ids = [...new Set(
      (memberRows || []).map(row => row.room_id)
    )];

    memberships.clear();
    ids.forEach(id => memberships.add(String(id)));

    if (!ids.length) {
      roomList.textContent = "참여 중인 단체 채팅방이 없습니다.";
      return;
    }

    const [roomsResult, membersResult, messagesResult] =
      await Promise.all([
        supabase
          .from("group_chat_rooms")
          .select("id, name, created_at")
          .in("id", ids),

        supabase
          .from("group_chat_members")
          .select("room_id, user_id")
          .in("room_id", ids),

        supabase
          .from("group_chat_messages")
          .select("id, room_id, sender_id, content, created_at")
          .in("room_id", ids)
          .order("created_at", { ascending: false })
          .limit(500)
      ]);

    if (roomsResult.error) throw roomsResult.error;
    if (membersResult.error) throw membersResult.error;
    if (messagesResult.error) throw messagesResult.error;

    if (version !== roomVersion) return;

    const counts = new Map();

    for (const member of membersResult.data || []) {
      const key = String(member.room_id);
      counts.set(key, (counts.get(key) || 0) + 1);
    }

    for (const message of messagesResult.data || []) {
      const key = String(message.room_id);
      const previous = latestMessages.get(key);

      if (
        !previous ||
        new Date(message.created_at) > new Date(previous.created_at)
      ) {
        latestMessages.set(key, message);
      }
    }

    const rooms = roomsResult.data || [];

    roomsCache.clear();
    rooms.forEach(room => roomsCache.set(String(room.id), room));

    rooms.sort((a, b) => {
      const timeA =
        latestMessages.get(String(a.id))?.created_at ||
        a.created_at;

      const timeB =
        latestMessages.get(String(b.id))?.created_at ||
        b.created_at;

      return new Date(timeB) - new Date(timeA);
    });

    const fragment = document.createDocumentFragment();

    for (const room of rooms) {
      const last = latestMessages.get(String(room.id));

      const button = element("button", "group-chat-list-item");
      button.type = "button";
      button.dataset.roomId = String(room.id);

      const avatar = element(
        "div",
        "group-chat-list-avatar",
        "👥"
      );

      const info = element("div", "group-chat-list-info");
      const title = element("div", "group-chat-list-title");

      title.append(
        element("span", "", room.name),
        element(
          "span",
          "group-chat-member-count",
          `${counts.get(String(room.id)) || 0}명`
        )
      );

      const preview = element(
        "div",
        "group-chat-list-preview",
        last
          ? `${last.sender_id === id ? "나: " : ""}${last.content}`
          : "새로운 대화를 시작해 보세요."
      );

      const time = element(
        "span",
        "group-chat-list-time",
        formatTime(last?.created_at || room.created_at)
      );

      info.append(title, preview);
      button.append(avatar, info, time);

      button.addEventListener("click", () => openRoom(room));

      fragment.appendChild(button);
    }

    roomList.replaceChildren(fragment);

  } catch (error) {
    console.error("단체 채팅 목록 오류:", error);

    if (version === roomVersion && !roomList.children.length) {
      roomList.textContent = "채팅방 목록을 불러오지 못했습니다.";
    }
  }
}

// =====================================
// 메시지 기록 조회
// =====================================

async function loadMessages(roomId) {
  const version = ++messageVersion;

  try {
    const { data, error } = await supabase
      .from("group_chat_messages")
      .select("id, room_id, sender_id, content, created_at")
      .eq("room_id", roomId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) throw error;

    if (
      version !== messageVersion ||
      String(activeRoomId) !== String(roomId)
    ) return;

    const ordered = [...(data || [])].reverse();

    const missingNames = [...new Set(
      ordered.map(message => message.sender_id)
        .filter(id => id !== userId && !senderNames.has(id))
    )];

    // 이름 조회는 메시지 표시와 병렬로 처리한다.
    if (missingNames.length) {
      getProfiles(missingNames).catch(console.error);
    }

    if (!ordered.length && !displayedIds.size) {
      messagesEl.replaceChildren(
        element("div", "group-chat-empty", "아직 메시지가 없습니다.")
      );
      return;
    }

    for (const message of ordered) {
      appendMessage(message);
    }

  } catch (error) {
    console.error("단체 채팅 메시지 조회 오류:", error);
  }
}

// =====================================
// Realtime
// =====================================

function stopRoomRealtime() {
  if (roomChannel) {
    supabase.removeChannel(roomChannel);
    roomChannel = null;
  }
}

function startRoomRealtime(roomId) {
  stopRoomRealtime();

  roomChannel = supabase
    .channel(`inha-group-room-${roomId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "group_chat_messages",
        filter: `room_id=eq.${roomId}`
      },
      payload => {
        const message = payload.new;

        updatePreview(message);

        if (String(activeRoomId) === String(roomId)) {
          appendMessage(message);
        }
      }
    )
    .subscribe(status => {
      console.log("단체 채팅 Realtime:", status);
    });
}

function startListRealtime() {
  if (listChannel) return;

  listChannel = supabase
    .channel("inha-group-list-updates")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "group_chat_members"
      },
      scheduleRefresh
    )
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "group_chat_messages"
      },
      payload => updatePreview(payload.new)
    )
    .subscribe();
}

// =====================================
// 채팅방 열기 / 닫기
// =====================================

async function openRoom(room) {
  if (!room?.id) return;

  activeRoomId = room.id;
  messageVersion++;
  displayedIds.clear();

  listView.hidden = true;
  roomView.hidden = false;
  roomTitle.textContent = room.name;

  messagesEl.replaceChildren();

  await getUserId();

  if (String(activeRoomId) !== String(room.id)) return;

  startRoomRealtime(room.id);
  await loadMessages(room.id);
}

function closeRoom() {
  activeRoomId = null;
  messageVersion++;
  displayedIds.clear();

  stopRoomRealtime();

  roomView.hidden = true;
  listView.hidden = false;
  messagesEl.replaceChildren();

  loadRooms(true);
}

backBtn?.addEventListener("click", closeRoom);

groupTab?.addEventListener("click", () => {
  if (activeRoomId) return;
  loadRooms(true);
});

// =====================================
// 메시지 전송
// =====================================

form?.addEventListener("submit", async event => {
  event.preventDefault();

  if (sending || !activeRoomId) return;

  const content = input.value.trim();
  if (!content) return;

  const roomId = activeRoomId;
  const button = form.querySelector('button[type="submit"]');

  sending = true;
  if (button) button.disabled = true;

  try {
    const id = await getUserId();

    if (!id) throw new Error("로그인이 필요합니다.");

    const { data, error } = await supabase
      .from("group_chat_messages")
      .insert({
        room_id: roomId,
        sender_id: id,
        content
      })
      .select("id, room_id, sender_id, content, created_at")
      .single();

    if (error) throw error;

    if (data) {
      updatePreview(data);
      appendMessage(data);
    }

    if (String(activeRoomId) === String(roomId)) {
      input.value = "";
    }

  } catch (error) {
    console.error("단체 채팅 전송 실패:", error);
    alert("메시지 전송 실패: " + error.message);
  } finally {
    sending = false;
    if (button) button.disabled = false;
  }
});

// =====================================
// 친구 선택 팝업
// =====================================

function selectFriends({
  title,
  friends,
  confirmText,
  onConfirm
}) {
  const overlay = element("div", "group-chat-menu-overlay");
  const panel = element("div", "group-chat-menu-panel");

  const heading = element("h3", "", title);
  const list = element("div", "group-chat-member-list");
  const checkboxes = [];

  for (const friend of friends) {
    const label = element("label", "group-chat-member-item");
    const checkbox = document.createElement("input");

    checkbox.type = "checkbox";
    checkbox.value = friend.id;

    label.append(checkbox, element("span", "", friend.name));
    list.appendChild(label);
    checkboxes.push(checkbox);
  }

  const actions = element("div");
  actions.style.cssText =
    "display:flex;gap:10px;justify-content:flex-end;margin-top:18px";

  const cancel = element(
    "button",
    "group-chat-menu-action",
    "취소"
  );

  const confirm = element(
    "button",
    "group-chat-menu-action",
    confirmText
  );

  cancel.type = "button";
  confirm.type = "button";

  actions.append(cancel, confirm);
  panel.append(heading, list, actions);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  const close = () => overlay.remove();

  cancel.onclick = close;
  overlay.onclick = event => {
    if (event.target === overlay) close();
  };

  confirm.onclick = async () => {
    const ids = checkboxes
      .filter(checkbox => checkbox.checked)
      .map(checkbox => checkbox.value);

    if (!ids.length) {
      alert("친구를 최소 1명 선택해주세요.");
      return;
    }

    confirm.disabled = true;

    try {
      const result = await onConfirm(ids);
      if (result !== false) close();
    } catch (error) {
      alert("처리 실패: " + error.message);
    } finally {
      confirm.disabled = false;
    }
  };
}

// =====================================
// 단체 채팅방 생성
// =====================================

createBtn?.addEventListener("click", async () => {
  createBtn.disabled = true;

  try {
    const friends = await loadFriends();

    if (!friends.length) {
      alert("초대할 수 있는 친구가 없습니다.");
      return;
    }

    const roomName = prompt("단체 채팅방 이름을 입력하세요.");
    if (roomName === null) return;

    const name = roomName.trim();

    if (!name || name.length > 100) {
      alert("채팅방 이름은 1~100자로 입력해주세요.");
      return;
    }

    selectFriends({
      title: "초대할 친구 선택",
      friends,
      confirmText: "채팅방 만들기",

      onConfirm: async ids => {
        const { error } = await supabase.rpc(
          "create_group_chat",
          {
            p_name: name,
            p_friend_ids: ids
          }
        );

        if (error) throw error;

        await loadRooms(true);
        alert("단체 채팅방이 생성되었습니다.");
        return true;
      }
    });

  } catch (error) {
    alert("채팅방 생성 실패: " + error.message);
  } finally {
    createBtn.disabled = false;
  }
});

// =====================================
// 참여자 확인
// =====================================

async function loadMembers(roomId, container, title) {
  const { data, error } = await supabase
    .from("group_chat_members")
    .select("user_id")
    .eq("room_id", roomId);

  if (error) throw error;

  const ids = (data || []).map(row => row.user_id);
  const names = await getProfiles(ids);

  if (!container.isConnected) return;

  title.textContent = `대화 상대 ${ids.length}명`;

  const fragment = document.createDocumentFragment();

  for (const id of ids) {
    const row = element("div", "group-chat-member-item");

    row.append(
      element("div", "group-chat-member-avatar", "👤"),
      element(
        "span",
        "",
        (names.get(id) || "이름 미설정") +
        (id === userId ? " (나)" : "")
      )
    );

    fragment.appendChild(row);
  }

  container.replaceChildren(fragment);
}

// =====================================
// 친구 초대
// =====================================

async function inviteFriends(roomId, closeMenu) {
  const friends = await loadFriends();

  const { data, error } = await supabase
    .from("group_chat_members")
    .select("user_id")
    .eq("room_id", roomId);

  if (error) throw error;

  const memberIds = new Set(
    (data || []).map(row => row.user_id)
  );

  const available = friends.filter(
    friend => !memberIds.has(friend.id)
  );

  if (!available.length) {
    alert("초대할 수 있는 친구가 없습니다.");
    return;
  }

  selectFriends({
    title: "친구 초대하기",
    friends: available,
    confirmText: "선택한 친구 초대",

    onConfirm: async ids => {
      let count = 0;

      try {
        for (const friendId of ids) {
          const { error } = await supabase.rpc(
            "invite_group_chat_friend",
            {
              p_room_id: roomId,
              p_friend_id: friendId
            }
          );

          if (error) throw error;
          count++;
        }

        closeMenu();
        scheduleRefresh();

        alert(`${count}명의 친구를 초대했습니다.`);
        return true;

      } catch (error) {
        alert(`${count}명 초대 완료. 오류: ${error.message}`);
        scheduleRefresh();
        return false;
      }
    }
  });
}

// =====================================
// 채팅방 나가기
// =====================================

async function leaveRoom(roomId, closeMenu) {
  if (!window.confirm("정말 채팅방을 나가시겠습니까?")) return;

  const { error } = await supabase.rpc(
    "leave_group_chat",
    { p_room_id: roomId }
  );

  if (error) throw error;

  closeMenu();
  closeRoom();
  scheduleRefresh();

  alert("채팅방에서 나갔습니다.");
}

// =====================================
// 채팅방 메뉴
// =====================================

async function openMenu() {
  if (!activeRoomId) return;

  if (menuOverlay) {
    menuOverlay.remove();
    menuOverlay = null;
  }

  const roomId = activeRoomId;

  const overlay = element("div", "group-chat-menu-overlay");
  const panel = element("div", "group-chat-menu-panel");
  const header = element("div", "group-chat-menu-header");

  const title = element("h3", "", "채팅방 서랍");
  const closeBtn = element("button", "", "✕");
  closeBtn.type = "button";

  header.append(title, closeBtn);

  const memberTitle = element("h4", "", "대화 상대");
  const memberList = element(
    "div",
    "group-chat-member-list",
    "참여자를 불러오는 중..."
  );

  const inviteBtn = element(
    "button",
    "group-chat-menu-action",
    "＋ 친구 초대하기"
  );

  const leaveBtn = element(
    "button",
    "group-chat-menu-action group-chat-leave-btn",
    "채팅방 나가기"
  );

  inviteBtn.type = "button";
  leaveBtn.type = "button";

  panel.append(
    header,
    memberTitle,
    memberList,
    inviteBtn,
    leaveBtn
  );

  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  menuOverlay = overlay;
  menuBtn?.setAttribute("aria-expanded", "true");

  const closeMenu = () => {
    overlay.remove();

    if (menuOverlay === overlay) {
      menuOverlay = null;
      menuBtn?.setAttribute("aria-expanded", "false");
    }
  };

  closeBtn.onclick = closeMenu;

  overlay.onclick = event => {
    if (event.target === overlay) closeMenu();
  };

  inviteBtn.onclick = async () => {
    inviteBtn.disabled = true;

    try {
      await inviteFriends(roomId, closeMenu);
    } catch (error) {
      alert("친구 초대 실패: " + error.message);
    } finally {
      inviteBtn.disabled = false;
    }
  };

  leaveBtn.onclick = async () => {
    leaveBtn.disabled = true;

    try {
      await leaveRoom(roomId, closeMenu);
    } catch (error) {
      alert("채팅방 나가기 실패: " + error.message);
    } finally {
      leaveBtn.disabled = false;
    }
  };

  try {
    await getUserId();
    await loadMembers(roomId, memberList, memberTitle);
  } catch (error) {
    memberList.textContent = "참여자를 불러오지 못했습니다.";
    console.error(error);
  }
}

menuBtn?.addEventListener("click", () => {
  if (menuOverlay) {
    menuOverlay.remove();
    menuOverlay = null;
    menuBtn.setAttribute("aria-expanded", "false");
  } else {
    openMenu();
  }
});

// =====================================
// 초기화
// =====================================

async function initialize() {
  try {
    const id = await getUserId();
    if (!id) return;

    await loadRooms();
    startListRealtime();

  } catch (error) {
    console.error("단체 채팅 초기화 오류:", error);
  }
}

window.addEventListener("inhaGoLoginSuccess", initialize);

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialize);
} else {
  initialize();
}

window.addEventListener("pagehide", () => {
  stopRoomRealtime();

  if (listChannel) {
    supabase.removeChannel(listChannel);
    listChannel = null;
  }
});
