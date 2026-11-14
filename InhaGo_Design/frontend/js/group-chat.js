
import { supabase } from "./supabase.js";

/* =========================================
   InhaGo 친구 단체 채팅
   실시간 속도 개선 버전
========================================= */

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

let roomVersion = 0;
let messageVersion = 0;
let refreshTimer = null;
let sending = false;

const displayedIds = new Set();
const senderNames = new Map();
const pendingNames = new Map();
const latestMessages = new Map();
const memberships = new Set();
const pendingMessages = new Map();

function element(tag, className = "", text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function sameId(a, b) {
  return String(a) === String(b);
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

  return date.toLocaleTimeString("ko-KR", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit"
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
  const result = new Map();

  if (!unique.length) return result;

  const missing = unique.filter(
    id => !senderNames.has(id)
  );

  for (const id of unique) {
    if (senderNames.has(id)) {
      result.set(id, senderNames.get(id));
    }
  }

  if (missing.length) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, nickname, real_name")
      .in("id", missing);

    if (error) throw error;

    for (const profile of data || []) {
      const name = displayName(profile);
      senderNames.set(profile.id, name);
      result.set(profile.id, name);
    }
  }

  return result;
}

async function resolveSenderName(id) {
  if (senderNames.has(id)) {
    return senderNames.get(id);
  }

  if (pendingNames.has(id)) {
    return pendingNames.get(id);
  }

  const promise = getProfiles([id])
    .then(names => names.get(id) || "이름 미설정")
    .finally(() => pendingNames.delete(id));

  pendingNames.set(id, promise);
  return promise;
}

/* =========================================
   친구 목록
========================================= */

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
    ).filter(Boolean)
  )];

  const names = await getProfiles(ids);

  return ids.map(id => ({
    id,
    name: names.get(id) || "이름 미설정"
  }));
}

/* =========================================
   메시지 렌더링
========================================= */

function createMessageElement(message, temporary = false) {
  const mine = sameId(message.sender_id, userId);

  const item = element("div");
  item.dataset.messageId = String(message.id);

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

  const content = element("div", "", message.content || "");

  const time = element(
    "small",
    "",
    temporary
      ? `${formatTime(message.created_at)} · 전송 중`
      : formatTime(message.created_at)
  );

  time.className = "group-message-time";

  time.style.cssText = `
    display:block;
    margin-top:5px;
    font-size:10px;
    opacity:.6;
  `;

  item.append(sender, content, time);

  if (!mine && !senderNames.has(message.sender_id)) {
    resolveSenderName(message.sender_id)
      .then(name => {
        if (item.isConnected) sender.textContent = name;
      })
      .catch(console.error);
  }

  return item;
}

function insertMessage(message, temporary = false) {
  if (!messagesEl || !message?.id) return null;

  if (!sameId(message.room_id, activeRoomId)) {
    return null;
  }

  const id = String(message.id);

  if (displayedIds.has(id)) return null;
  displayedIds.add(id);

  messagesEl.querySelectorAll(".group-chat-empty")
    .forEach(el => el.remove());

  const item = createMessageElement(message, temporary);

  // 기존 기록과 실시간 메시지가 섞여도 시간순 유지
  const messageTime = new Date(message.created_at).getTime();

  let inserted = false;

  for (const existing of messagesEl.children) {
    const existingTime = Number(existing.dataset.timestamp || 0);

    if (existingTime > messageTime) {
      messagesEl.insertBefore(item, existing);
      inserted = true;
      break;
    }
  }

  if (!inserted) messagesEl.appendChild(item);

  item.dataset.timestamp = String(messageTime);

  messagesEl.scrollTop = messagesEl.scrollHeight;

  return item;
}

/* =========================================
   임시 메시지 관리
========================================= */

function createTemporaryMessage(roomId, content) {
  const tempId =
    `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const message = {
    id: tempId,
    room_id: roomId,
    sender_id: userId,
    content,
    created_at: new Date().toISOString()
  };

  const item = insertMessage(message, true);

  pendingMessages.set(tempId, {
    roomId,
    content,
    item,
    createdAt: Date.now()
  });

  return tempId;
}

function confirmTemporaryMessage(tempId, savedMessage) {
  const pending = pendingMessages.get(tempId);

  if (!pending) return;

  pendingMessages.delete(tempId);
  displayedIds.delete(tempId);

  const realId = String(savedMessage.id);

  if (pending.item?.isConnected) {
    const alreadyExists = displayedIds.has(realId);

    if (alreadyExists) {
      pending.item.remove();
    } else {
      pending.item.dataset.messageId = realId;
      pending.item.dataset.timestamp = String(
        new Date(savedMessage.created_at).getTime()
      );

      const time = pending.item.querySelector(".group-message-time");

      if (time) {
        time.textContent = formatTime(savedMessage.created_at);
      }

      displayedIds.add(realId);
    }
  }

  updatePreview(savedMessage);
}

function failTemporaryMessage(tempId) {
  const pending = pendingMessages.get(tempId);
  if (!pending) return;

  pendingMessages.delete(tempId);

  if (pending.item?.isConnected) {
    const time = pending.item.querySelector(".group-message-time");

    if (time) {
      time.textContent += " · 전송 실패";
      time.style.color = "#dc2626";
    }
  }
}

/* =========================================
   채팅방 미리보기
========================================= */

function updatePreview(message) {
  if (!message?.room_id) return;

  const roomId = String(message.room_id);
  if (!memberships.has(roomId)) return;

  const previous = latestMessages.get(roomId);

  if (
    previous &&
    new Date(previous.created_at) > new Date(message.created_at)
  ) return;

  latestMessages.set(roomId, message);

  const row = [...roomList.querySelectorAll("[data-room-id]")]
    .find(el => el.dataset.roomId === roomId);

  if (!row) return;

  const preview = row.querySelector(".group-chat-list-preview");
  const time = row.querySelector(".group-chat-list-time");

  if (preview) {
    preview.textContent =
      (sameId(message.sender_id, userId) ? "나: " : "") +
      message.content;
  }

  if (time) time.textContent = formatTime(message.created_at);

  roomList.prepend(row);
}

function scheduleRefresh() {
  clearTimeout(refreshTimer);

  refreshTimer = setTimeout(() => {
    loadRooms(true);
  }, 400);
}

/* =========================================
   채팅방 목록
========================================= */

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

    if (version !== roomVersion) return;

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
          .limit(300)
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
          ? `${sameId(last.sender_id, id) ? "나: " : ""}${last.content}`
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

    if (version === roomVersion) {
      roomList.textContent = "채팅방 목록을 불러오지 못했습니다.";
    }
  }
}

/* =========================================
   기존 메시지 조회
========================================= */

async function loadMessages(roomId) {
  const version = ++messageVersion;

  try {
    const { data, error } = await supabase
      .from("group_chat_messages")
      .select("id, room_id, sender_id, content, created_at")
      .eq("room_id", roomId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw error;

    if (
      version !== messageVersion ||
      !sameId(activeRoomId, roomId)
    ) return;

    const ordered = [...(data || [])].reverse();

    // 메시지는 이름 조회를 기다리지 않고 먼저 표시
    for (const message of ordered) {
      insertMessage(message);
    }

    const missingNames = [...new Set(
      ordered
        .map(message => message.sender_id)
        .filter(id => id !== userId && !senderNames.has(id))
    )];

    if (missingNames.length) {
      getProfiles(missingNames)
        .then(names => {
          if (!sameId(activeRoomId, roomId)) return;

          messagesEl.querySelectorAll("[data-message-id]")
            .forEach(item => {
              const message = ordered.find(
                m => String(m.id) === item.dataset.messageId
              );

              if (!message) return;

              const name = names.get(message.sender_id);
              const sender = item.querySelector("strong");

              if (name && sender) sender.textContent = name;
            });
        })
        .catch(console.error);
    }

    if (!ordered.length && !displayedIds.size) {
      messagesEl.replaceChildren(
        element("div", "group-chat-empty", "아직 메시지가 없습니다.")
      );
    }

  } catch (error) {
    console.error("단체 채팅 메시지 조회 오류:", error);
  }
}

/* =========================================
   실시간 수신
========================================= */

function handleIncomingMessage(message) {
  if (!message?.id) return;

  updatePreview(message);

  if (sameId(activeRoomId, message.room_id)) {
    insertMessage(message);
  }
}

function stopRoomRealtime() {
  if (roomChannel) {
    supabase.removeChannel(roomChannel);
    roomChannel = null;
  }
}

function startRoomRealtime(roomId) {
  stopRoomRealtime();

  roomChannel = supabase
    .channel(`inha-group-room-${roomId}-${Date.now()}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "group_chat_messages",
        filter: `room_id=eq.${roomId}`
      },
      payload => {
        if (!sameId(activeRoomId, roomId)) return;
        handleIncomingMessage(payload.new);
      }
    )
    .subscribe(status => {
      console.log("단체 채팅방 실시간 상태:", status);
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
      payload => {
        updatePreview(payload.new);
      }
    )
    .subscribe(status => {
      console.log("단체 채팅 목록 실시간 상태:", status);
    });
}

/* =========================================
   채팅방 열기 / 닫기
========================================= */

async function openRoom(room) {
  if (!room?.id) return;

  activeRoomId = room.id;
  messageVersion++;
  displayedIds.clear();

  listView.hidden = true;
  roomView.hidden = false;
  roomTitle.textContent = room.name;

  messagesEl.replaceChildren();

  // 기존 인증 정보를 우선 사용
  if (!userId) {
    await getUserId();
  }

  if (!sameId(activeRoomId, room.id)) return;

  startRoomRealtime(room.id);
  await loadMessages(room.id);
}

function closeRoom() {
  activeRoomId = null;
  messageVersion++;
  displayedIds.clear();

  stopRoomRealtime();

  if (roomView) roomView.hidden = true;
  if (listView) listView.hidden = false;
  if (messagesEl) messagesEl.replaceChildren();

  loadRooms(true);
}

backBtn?.addEventListener("click", closeRoom);

groupTab?.addEventListener("click", () => {
  if (!activeRoomId) loadRooms(true);
});

/* =========================================
   메시지 전송 - 즉시 화면 표시
========================================= */

form?.addEventListener("submit", async event => {
  event.preventDefault();

  if (sending || !activeRoomId) return;

  const content = input?.value.trim();
  if (!content) return;

  const roomId = activeRoomId;
  const button = form.querySelector('button[type="submit"]');

  sending = true;
  if (button) button.disabled = true;

  let tempId = null;

  try {
    if (!userId) {
      await getUserId();
    }

    if (!userId) throw new Error("로그인이 필요합니다.");

    // 전송 버튼을 누르자마자 화면에 표시
    tempId = createTemporaryMessage(roomId, content);

    input.value = "";

    const { data, error } = await supabase
      .from("group_chat_messages")
      .insert({
        room_id: roomId,
        sender_id: userId,
        content
      })
      .select("id, room_id, sender_id, content, created_at")
      .single();

    if (error) throw error;

    if (data) {
      confirmTemporaryMessage(tempId, data);
    }

  } catch (error) {
    console.error("단체 채팅 전송 실패:", error);

    if (tempId) {
      failTemporaryMessage(tempId);
    } else {
      alert("메시지 전송 실패: " + error.message);
    }

  } finally {
    sending = false;
    if (button) button.disabled = false;
  }
});

/* =========================================
   친구 선택 팝업
========================================= */

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

    label.append(
      checkbox,
      element("span", "", friend.name)
    );

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

/* =========================================
   단체 채팅방 생성
========================================= */

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

/* =========================================
   참여자 확인
========================================= */

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
        (sameId(id, userId) ? " (나)" : "")
      )
    );

    fragment.appendChild(row);
  }

  container.replaceChildren(fragment);
}

/* =========================================
   친구 초대
========================================= */

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
        // 여러 친구 초대 요청을 병렬 처리
        const results = await Promise.allSettled(
          ids.map(friendId =>
            supabase.rpc(
              "invite_group_chat_friend",
              {
                p_room_id: roomId,
                p_friend_id: friendId
              }
            ).then(({ error }) => {
              if (error) throw error;
              return friendId;
            })
          )
        );

        count = results.filter(
          result => result.status === "fulfilled"
        ).length;

        closeMenu();
        scheduleRefresh();

        if (count === ids.length) {
          alert(`${count}명의 친구를 초대했습니다.`);
          return true;
        }

        alert(
          `${count}명 초대 완료, ${ids.length - count}명 초대 실패`
        );

        return false;

      } catch (error) {
        console.error("친구 초대 오류:", error);
        scheduleRefresh();
        return false;
      }
    }
  });
}

/* =========================================
   채팅방 나가기
========================================= */

async function leaveRoom(roomId, closeMenu) {
  if (!window.confirm("정말 채팅방을 나가시겠습니까?")) {
    return;
  }

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

/* =========================================
   채팅방 관리 메뉴
========================================= */

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

/* =========================================
   초기화
========================================= */

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

window.addEventListener(
  "inhaGoLoginSuccess",
  initialize
);

if (document.readyState === "loading") {
  document.addEventListener(
    "DOMContentLoaded",
    initialize
  );
} else {
  initialize();
}

window.addEventListener("pagehide", () => {
  clearTimeout(refreshTimer);
  stopRoomRealtime();

  if (listChannel) {
    supabase.removeChannel(listChannel);
    listChannel = null;
  }
});
