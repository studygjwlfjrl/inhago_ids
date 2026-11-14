
import { supabase as supabaseDev } from "./supabase.js";

/* =========================================
   InhaGo 친구 단체 채팅
   - 통합 채팅 탭 호환
   - 채팅방 생성
   - 실시간 메시지
   - 최신 메시지순 목록
   - 친구 초대
   - 참여자 확인
   - 채팅방 나가기
========================================= */

const meetingTab = document.getElementById("meeting-chat-tab");
const groupTab = document.getElementById("group-chat-tab");
const directTab = document.getElementById("direct-chat-tab");

const meetingView = document.querySelector(
  "#chat-page .chat-container"
);
const groupView = document.getElementById("group-chat-view");
const directView = document.getElementById("direct-chat-view");

const createGroupChatBtn = document.getElementById(
  "create-group-chat-btn"
);

const groupRoomList = document.getElementById(
  "group-chat-room-list"
);
const groupListView = document.getElementById(
  "group-chat-list-view"
);
const groupRoomView = document.getElementById(
  "group-chat-room-view"
);
const groupBackBtn = document.getElementById(
  "group-chat-back"
);
const groupRoomTitle = document.getElementById(
  "group-chat-room-title"
);
const groupMessages = document.getElementById(
  "group-chat-messages"
);
const groupForm = document.getElementById(
  "group-chat-form"
);
const groupInput = document.getElementById(
  "group-chat-input"
);
const groupMenuBtn = document.getElementById(
  "group-chat-menu-btn"
);

let activeGroupRoomId = null;
let currentGroupUserId = null;
let groupChatChannel = null;
let groupListChannel = null;
let groupMenuOverlay = null;

let roomLoadVersion = 0;
let messageLoadVersion = 0;
let sendingMessage = false;

/* =========================================
   1. 공통 함수
========================================= */

async function getGroupUserId() {
  const { data, error } = await supabaseDev.auth.getUser();

  if (error) throw error;

  currentGroupUserId = data?.user?.id || null;
  return currentGroupUserId;
}

function displayName(profile) {
  return (
    profile?.nickname ||
    profile?.real_name?.split("/")[0]?.trim() ||
    "이름 미설정"
  );
}

function formatChatTime(value) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const today = new Date();

  if (date.toDateString() === today.toDateString()) {
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

function makeElement(tag, className, content) {
  const element = document.createElement(tag);

  if (className) element.className = className;
  if (content !== undefined) element.textContent = content;

  return element;
}

function closeOverlay(overlay) {
  if (!overlay) return;
  overlay.remove();

  if (groupMenuOverlay === overlay) {
    groupMenuOverlay = null;
    groupMenuBtn?.setAttribute("aria-expanded", "false");
  }
}

/* =========================================
   2. 통합 채팅 탭 호환

   index.html에서 이미 세 가지 탭을 관리하므로
   여기서는 화면 전환을 중복 처리하지 않는다.
========================================= */

groupTab?.addEventListener("click", () => {
  if (activeGroupRoomId) {
    loadGroupMessages(activeGroupRoomId);
  } else {
    loadGroupChatRooms();
  }
});

/* =========================================
   3. 수락된 친구 목록 조회
========================================= */

async function loadAcceptedFriends(userId) {
  const { data: friendships, error } = await supabaseDev
    .from("friendships")
    .select("requester_id, receiver_id")
    .eq("status", "accepted")
    .or(
      `requester_id.eq.${userId},receiver_id.eq.${userId}`
    );

  if (error) throw error;

  const friendIds = [
    ...new Set(
      (friendships || [])
        .map(friend =>
          friend.requester_id === userId
            ? friend.receiver_id
            : friend.requester_id
        )
        .filter(Boolean)
    )
  ];

  if (friendIds.length === 0) return [];

  const { data: profiles, error: profileError } =
    await supabaseDev
      .from("profiles")
      .select("id, nickname, real_name")
      .in("id", friendIds);

  if (profileError) throw profileError;

  const profileMap = new Map(
    (profiles || []).map(profile => [
      profile.id,
      profile
    ])
  );

  return friendIds.map(id => ({
    id,
    name: displayName(profileMap.get(id))
  }));
}

/* =========================================
   4. 친구 선택 팝업
========================================= */

function showFriendSelection({
  title,
  friends,
  confirmText,
  onConfirm
}) {
  const overlay = makeElement(
    "div",
    "group-chat-menu-overlay"
  );

  const panel = makeElement(
    "div",
    "group-chat-menu-panel"
  );

  const heading = makeElement("h3", "", title);
  const friendList = makeElement(
    "div",
    "group-chat-member-list"
  );

  const checkboxes = [];

  friends.forEach(friend => {
    const label = makeElement(
      "label",
      "group-chat-member-item"
    );

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = friend.id;

    const name = makeElement(
      "span",
      "",
      friend.name
    );

    label.append(checkbox, name);
    friendList.appendChild(label);
    checkboxes.push(checkbox);
  });

  const actions = makeElement("div");
  actions.style.cssText = `
    display:flex;
    gap:10px;
    justify-content:flex-end;
    margin-top:18px;
  `;

  const cancelBtn = makeElement(
    "button",
    "group-chat-menu-action",
    "취소"
  );
  cancelBtn.type = "button";

  const confirmBtn = makeElement(
    "button",
    "group-chat-menu-action",
    confirmText
  );
  confirmBtn.type = "button";

  actions.append(cancelBtn, confirmBtn);
  panel.append(heading, friendList, actions);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  const close = () => overlay.remove();

  cancelBtn.addEventListener("click", close);

  overlay.addEventListener("click", event => {
    if (event.target === overlay) close();
  });

  confirmBtn.addEventListener("click", async () => {
    const selectedIds = checkboxes
      .filter(checkbox => checkbox.checked)
      .map(checkbox => checkbox.value);

    if (selectedIds.length === 0) {
      alert("친구를 최소 1명 선택해주세요.");
      return;
    }

    confirmBtn.disabled = true;

    try {
      const shouldClose = await onConfirm(selectedIds);

      if (shouldClose !== false) {
        close();
      }
    } catch (error) {
      console.error("친구 선택 처리 오류:", error);
      alert("처리 실패: " + error.message);
    } finally {
      confirmBtn.disabled = false;
    }
  });

  return overlay;
}

/* =========================================
   5. 단체 채팅방 만들기
========================================= */

createGroupChatBtn?.addEventListener(
  "click",
  async () => {
    createGroupChatBtn.disabled = true;

    try {
      const userId = await getGroupUserId();

      if (!userId) {
        alert("로그인이 필요합니다.");
        return;
      }

      const friends = await loadAcceptedFriends(userId);

      if (friends.length === 0) {
        alert("초대할 수 있는 친구가 없습니다.");
        return;
      }

      const roomName = prompt(
        "단체 채팅방 이름을 입력하세요."
      );

      if (roomName === null) return;

      const name = roomName.trim();

      if (!name || name.length > 100) {
        alert("채팅방 이름은 1~100자로 입력해주세요.");
        return;
      }

      showFriendSelection({
        title: "초대할 친구 선택",
        friends,
        confirmText: "채팅방 만들기",

        onConfirm: async selectedIds => {
          const { data: roomId, error } =
            await supabaseDev.rpc(
              "create_group_chat",
              {
                p_name: name,
                p_friend_ids: selectedIds
              }
            );

          if (error) throw error;

          console.log("생성된 채팅방 ID:", roomId);

          await loadGroupChatRooms();
          alert("단체 채팅방이 생성되었습니다.");

          return true;
        }
      });

    } catch (error) {
      console.error("단체 채팅방 생성 오류:", error);
      alert("채팅방 생성 실패: " + error.message);
    } finally {
      createGroupChatBtn.disabled = false;
    }
  }
);

/* =========================================
   6. 실시간 채팅 관리
========================================= */

function stopGroupChatRealtime() {
  if (!groupChatChannel) return;

  const channel = groupChatChannel;
  groupChatChannel = null;

  supabaseDev.removeChannel(channel);
}

function startGroupChatRealtime(roomId) {
  stopGroupChatRealtime();

  if (!roomId) return;

  groupChatChannel = supabaseDev
    .channel(`inha-group-room-${roomId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "group_chat_messages",
        filter: `room_id=eq.${roomId}`
      },
      () => {
        if (activeGroupRoomId === roomId) {
          loadGroupMessages(roomId);
        }

        loadGroupChatRooms({
          silent: true
        });
      }
    )
    .subscribe(status => {
      if (status === "SUBSCRIBED") {
        console.log(
          "단체 채팅 실시간 연결 완료:",
          roomId
        );
      }

      if (
        status === "CHANNEL_ERROR" ||
        status === "TIMED_OUT"
      ) {
        console.warn(
          "단체 채팅 실시간 연결 상태:",
          status
        );
      }
    });
}

/* =========================================
   7. 채팅방 목록 실시간 갱신

   새 방에 초대되거나 참여 정보가 바뀌면
   목록을 다시 불러온다.
========================================= */

function startGroupListRealtime() {
  if (groupListChannel) return;

  groupListChannel = supabaseDev
    .channel("inha-group-list-updates")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "group_chat_members"
      },
      () => {
        loadGroupChatRooms({ silent: true });
      }
    )
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "group_chat_messages"
      },
      () => {
        loadGroupChatRooms({ silent: true });
      }
    )
    .subscribe();
}

/* =========================================
   8. 단체 채팅방 목록
========================================= */

async function loadGroupChatRooms(options = {}) {
  if (!groupRoomList) return;

  const version = ++roomLoadVersion;

  if (!options.silent) {
    groupRoomList.textContent =
      "채팅방을 불러오는 중...";
  }

  try {
    const userId = await getGroupUserId();

    if (version !== roomLoadVersion) return;

    if (!userId) {
      groupRoomList.textContent =
        "로그인 후 이용할 수 있습니다.";
      return;
    }

    const { data: memberships, error: memberError } =
      await supabaseDev
        .from("group_chat_members")
        .select("room_id")
        .eq("user_id", userId);

    if (memberError) throw memberError;

    if (version !== roomLoadVersion) return;

    const roomIds = [
      ...new Set(
        (memberships || [])
          .map(member => member.room_id)
          .filter(Boolean)
      )
    ];

    if (roomIds.length === 0) {
      groupRoomList.textContent =
        "참여 중인 단체 채팅방이 없습니다.";
      return;
    }

    const [
      roomsResult,
      membersResult,
      messagesResult
    ] = await Promise.all([
      supabaseDev
        .from("group_chat_rooms")
        .select("id, name, created_at")
        .in("id", roomIds),

      supabaseDev
        .from("group_chat_members")
        .select("room_id, user_id")
        .in("room_id", roomIds),

      supabaseDev
        .from("group_chat_messages")
        .select(
          "room_id, sender_id, content, created_at"
        )
        .in("room_id", roomIds)
        .order("created_at", {
          ascending: false
        })
        .limit(1000)
    ]);

    if (roomsResult.error) throw roomsResult.error;
    if (membersResult.error) throw membersResult.error;
    if (messagesResult.error) throw messagesResult.error;

    if (version !== roomLoadVersion) return;

    const memberCounts = new Map();

    for (const member of membersResult.data || []) {
      memberCounts.set(
        member.room_id,
        (memberCounts.get(member.room_id) || 0) + 1
      );
    }

    const latestMessages = new Map();

    for (const message of messagesResult.data || []) {
      if (!latestMessages.has(message.room_id)) {
        latestMessages.set(
          message.room_id,
          message
        );
      }
    }

    const rooms = [...(roomsResult.data || [])];

    rooms.sort((a, b) => {
      const timeA =
        latestMessages.get(a.id)?.created_at ||
        a.created_at ||
        "";

      const timeB =
        latestMessages.get(b.id)?.created_at ||
        b.created_at ||
        "";

      return new Date(timeB) - new Date(timeA);
    });

    const fragment = document.createDocumentFragment();

    for (const room of rooms) {
      const lastMessage = latestMessages.get(room.id);
      const memberCount = memberCounts.get(room.id) || 0;

      const button = makeElement(
        "button",
        "group-chat-list-item"
      );
      button.type = "button";

      const avatar = makeElement(
        "div",
        "group-chat-list-avatar",
        "👥"
      );

      const info = makeElement(
        "div",
        "group-chat-list-info"
      );

      const title = makeElement(
        "div",
        "group-chat-list-title"
      );

      const name = makeElement(
        "span",
        "",
        room.name
      );

      const count = makeElement(
        "span",
        "group-chat-member-count",
        `${memberCount}명`
      );

      title.append(name, count);

      const preview = makeElement(
        "div",
        "group-chat-list-preview"
      );

      preview.textContent = lastMessage
        ? `${
            lastMessage.sender_id === userId
              ? "나: "
              : ""
          }${lastMessage.content}`
        : "새로운 대화를 시작해 보세요.";

      info.append(title, preview);

      const time = makeElement(
        "span",
        "group-chat-list-time",
        formatChatTime(
          lastMessage?.created_at ||
          room.created_at
        )
      );

      button.append(avatar, info, time);

      button.addEventListener("click", () => {
        openGroupChatRoom(room);
      });

      fragment.appendChild(button);
    }

    groupRoomList.replaceChildren(fragment);

  } catch (error) {
    console.error(
      "단체 채팅방 목록 오류:",
      error
    );

    if (version === roomLoadVersion) {
      groupRoomList.textContent =
        "채팅방 목록을 불러오지 못했습니다.";
    }
  }
}

/* =========================================
   9. 채팅방 열기
========================================= */

async function openGroupChatRoom(room) {
  if (!room?.id) return;

  activeGroupRoomId = room.id;
  messageLoadVersion++;

  groupListView.hidden = true;
  groupRoomView.hidden = false;
  groupRoomTitle.textContent = room.name;

  groupMessages.textContent =
    "메시지를 불러오는 중...";

  await getGroupUserId();

  if (activeGroupRoomId !== room.id) return;

  startGroupChatRealtime(room.id);
  await loadGroupMessages(room.id);
}

/* =========================================
   10. 메시지 목록 조회
========================================= */

async function loadGroupMessages(roomId) {
  if (!groupMessages || !roomId) return;

  const version = ++messageLoadVersion;

  try {
    const { data: messages, error } =
      await supabaseDev
        .from("group_chat_messages")
        .select(
          "id, sender_id, content, created_at"
        )
        .eq("room_id", roomId)
        .order("created_at", {
          ascending: false
        })
        .limit(200);

    if (error) throw error;

    if (
      version !== messageLoadVersion ||
      activeGroupRoomId !== roomId
    ) {
      return;
    }

    const orderedMessages = [...(messages || [])]
      .reverse();

    const senderIds = [
      ...new Set(
        orderedMessages
          .map(message => message.sender_id)
          .filter(Boolean)
      )
    ];

    let profiles = [];

    if (senderIds.length > 0) {
      const { data, error: profileError } =
        await supabaseDev
          .from("profiles")
          .select("id, nickname, real_name")
          .in("id", senderIds);

      if (profileError) {
        console.error(
          "작성자 프로필 조회 오류:",
          profileError
        );
      } else {
        profiles = data || [];
      }
    }

    if (
      version !== messageLoadVersion ||
      activeGroupRoomId !== roomId
    ) {
      return;
    }

    const profileMap = new Map(
      profiles.map(profile => [
        profile.id,
        profile
      ])
    );

    const fragment = document.createDocumentFragment();

    if (orderedMessages.length === 0) {
      groupMessages.textContent =
        "아직 메시지가 없습니다.";
      return;
    }

    for (const message of orderedMessages) {
      const isMine =
        message.sender_id === currentGroupUserId;

      const item = makeElement("div");

      item.style.cssText = `
        padding:10px;
        margin:8px 0;
        border-radius:10px;
        background:${isMine ? "#dceaff" : "#f1f1f1"};
        color:#222;
        text-align:${isMine ? "right" : "left"};
        overflow-wrap:anywhere;
      `;

      const profile = profileMap.get(
        message.sender_id
      );

      const sender = makeElement(
        "strong",
        "",
        isMine ? "나" : displayName(profile)
      );

      const content = makeElement(
        "div",
        "",
        message.content
      );

      const time = makeElement(
        "small",
        "",
        formatChatTime(message.created_at)
      );

      time.style.cssText = `
        display:block;
        margin-top:5px;
        font-size:10px;
        opacity:.6;
      `;

      item.append(sender, content, time);
      fragment.appendChild(item);
    }

    groupMessages.replaceChildren(fragment);
    groupMessages.scrollTop =
      groupMessages.scrollHeight;

  } catch (error) {
    console.error("메시지 조회 오류:", error);

    if (
      version === messageLoadVersion &&
      activeGroupRoomId === roomId
    ) {
      groupMessages.textContent =
        "메시지를 불러오지 못했습니다.";
    }
  }
}

/* =========================================
   11. 메시지 전송
========================================= */

groupForm?.addEventListener(
  "submit",
  async event => {
    event.preventDefault();

    if (sendingMessage) return;

    const roomId = activeGroupRoomId;
    const content = groupInput?.value.trim();

    if (!roomId || !content) return;

    sendingMessage = true;

    const submitBtn = groupForm.querySelector(
      'button[type="submit"]'
    );

    if (submitBtn) submitBtn.disabled = true;

    try {
      const userId = await getGroupUserId();

      if (!userId) {
        alert("로그인이 필요합니다.");
        return;
      }

      const { error } = await supabaseDev
        .from("group_chat_messages")
        .insert({
          room_id: roomId,
          sender_id: userId,
          content
        });

      if (error) throw error;

      if (activeGroupRoomId === roomId) {
        groupInput.value = "";
        await loadGroupMessages(roomId);
      }

      await loadGroupChatRooms({
        silent: true
      });

    } catch (error) {
      console.error("메시지 전송 오류:", error);
      alert(
        "메시지 전송 실패: " + error.message
      );
    } finally {
      sendingMessage = false;

      if (submitBtn) {
        submitBtn.disabled = false;
      }
    }
  }
);

/* =========================================
   12. 채팅방 목록으로 돌아가기
========================================= */

function closeGroupChatRoom() {
  activeGroupRoomId = null;
  messageLoadVersion++;

  stopGroupChatRealtime();

  if (groupRoomView) {
    groupRoomView.hidden = true;
  }

  if (groupListView) {
    groupListView.hidden = false;
  }

  if (groupMessages) {
    groupMessages.replaceChildren();
  }

  loadGroupChatRooms();
}

groupBackBtn?.addEventListener(
  "click",
  closeGroupChatRoom
);

/* =========================================
   13. 채팅방 참여자 목록
========================================= */

async function loadGroupMembers(roomId, container, title) {
  const { data: members, error } =
    await supabaseDev
      .from("group_chat_members")
      .select("user_id")
      .eq("room_id", roomId);

  if (error) throw error;

  const memberIds = (members || [])
    .map(member => member.user_id);

  let profiles = [];

  if (memberIds.length > 0) {
    const result = await supabaseDev
      .from("profiles")
      .select("id, nickname, real_name")
      .in("id", memberIds);

    if (result.error) throw result.error;

    profiles = result.data || [];
  }

  if (!container.isConnected) return;

  const profileMap = new Map(
    profiles.map(profile => [
      profile.id,
      profile
    ])
  );

  title.textContent =
    `대화 상대 ${memberIds.length}명`;

  const fragment = document.createDocumentFragment();

  for (const id of memberIds) {
    const row = makeElement(
      "div",
      "group-chat-member-item"
    );

    const avatar = makeElement(
      "div",
      "group-chat-member-avatar",
      "👤"
    );

    const profile = profileMap.get(id);

    const name = makeElement(
      "span",
      "",
      id === currentGroupUserId
        ? `${displayName(profile)} (나)`
        : displayName(profile)
    );

    row.append(avatar, name);
    fragment.appendChild(row);
  }

  container.replaceChildren(fragment);
}

/* =========================================
   14. 친구 초대하기
========================================= */

async function inviteFriendsToGroup(roomId, closeMenu) {
  const userId = await getGroupUserId();

  if (!userId) {
    alert("로그인이 필요합니다.");
    return;
  }

  const friends = await loadAcceptedFriends(userId);

  const { data: members, error } =
    await supabaseDev
      .from("group_chat_members")
      .select("user_id")
      .eq("room_id", roomId);

  if (error) throw error;

  const memberIds = new Set(
    (members || []).map(member => member.user_id)
  );

  const availableFriends = friends.filter(
    friend => !memberIds.has(friend.id)
  );

  if (availableFriends.length === 0) {
    alert("초대할 수 있는 친구가 없습니다.");
    return;
  }

  showFriendSelection({
    title: "친구 초대하기",
    friends: availableFriends,
    confirmText: "선택한 친구 초대",

    onConfirm: async selectedIds => {
      let invitedCount = 0;

      try {
        for (const friendId of selectedIds) {
          const { error: inviteError } =
            await supabaseDev.rpc(
              "invite_group_chat_friend",
              {
                p_room_id: roomId,
                p_friend_id: friendId
              }
            );

          if (inviteError) throw inviteError;

          invitedCount++;
        }

        closeMenu();

        await loadGroupChatRooms({
          silent: true
        });

        alert(
          `${invitedCount}명의 친구를 초대했습니다.`
        );

        return true;

      } catch (error) {
        console.error("친구 초대 오류:", error);

        alert(
          `${invitedCount}명 초대 완료. ` +
          `나머지 초대 중 오류: ${error.message}`
        );

        await loadGroupChatRooms({
          silent: true
        });

        return false;
      }
    }
  });
}

/* =========================================
   15. 채팅방 나가기
========================================= */

async function leaveGroupChat(roomId, closeMenu) {
  const confirmed = confirm(
    "정말 채팅방을 나가시겠습니까?\n" +
    "나가면 내 채팅 목록에서 이 방이 사라집니다."
  );

  if (!confirmed) return;

  const { error } = await supabaseDev.rpc(
    "leave_group_chat",
    {
      p_room_id: roomId
    }
  );

  if (error) throw error;

  stopGroupChatRealtime();
  closeMenu();
  closeGroupChatRoom();

  alert("채팅방에서 나갔습니다.");
}

/* =========================================
   16. 채팅방 관리 메뉴
========================================= */

async function openGroupChatMenu() {
  if (!activeGroupRoomId) return;

  if (groupMenuOverlay) {
    closeOverlay(groupMenuOverlay);
  }

  const roomId = activeGroupRoomId;

  const overlay = makeElement(
    "div",
    "group-chat-menu-overlay"
  );

  const panel = makeElement(
    "div",
    "group-chat-menu-panel"
  );

  const header = makeElement(
    "div",
    "group-chat-menu-header"
  );

  const title = makeElement(
    "h3",
    "",
    "채팅방 서랍"
  );

  const closeBtn = makeElement(
    "button",
    "",
    "✕"
  );
  closeBtn.type = "button";
  closeBtn.setAttribute("aria-label", "닫기");

  header.append(title, closeBtn);

  const memberTitle = makeElement(
    "h4",
    "",
    "대화 상대"
  );

  const memberList = makeElement(
    "div",
    "group-chat-member-list",
    "참여자를 불러오는 중..."
  );

  const inviteBtn = makeElement(
    "button",
    "group-chat-menu-action",
    "＋ 친구 초대하기"
  );
  inviteBtn.type = "button";

  const leaveBtn = makeElement(
    "button",
    "group-chat-menu-action group-chat-leave-btn",
    "채팅방 나가기"
  );
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

  groupMenuOverlay = overlay;

  groupMenuBtn?.setAttribute(
    "aria-expanded",
    "true"
  );

  const closeMenu = () => {
    closeOverlay(overlay);
  };

  closeBtn.addEventListener(
    "click",
    closeMenu
  );

  overlay.addEventListener("click", event => {
    if (event.target === overlay) {
      closeMenu();
    }
  });

  try {
    await getGroupUserId();

    await loadGroupMembers(
      roomId,
      memberList,
      memberTitle
    );

  } catch (error) {
    console.error("참여자 조회 오류:", error);

    if (overlay.isConnected) {
      memberList.textContent =
        "참여자 목록을 불러오지 못했습니다.";
    }
  }

  inviteBtn.addEventListener(
    "click",
    async () => {
      inviteBtn.disabled = true;

      try {
        await inviteFriendsToGroup(
          roomId,
          closeMenu
        );
      } catch (error) {
        console.error("친구 초대 오류:", error);
        alert(
          "친구 초대 실패: " + error.message
        );
      } finally {
        inviteBtn.disabled = false;
      }
    }
  );

  leaveBtn.addEventListener(
    "click",
    async () => {
      leaveBtn.disabled = true;

      try {
        await leaveGroupChat(
          roomId,
          closeMenu
        );
      } catch (error) {
        console.error("채팅방 나가기 오류:", error);
        alert(
          "채팅방 나가기 실패: " + error.message
        );
      } finally {
        leaveBtn.disabled = false;
      }
    }
  );
}

/* =========================================
   17. 관리 메뉴 버튼
========================================= */

groupMenuBtn?.addEventListener(
  "click",
  () => {
    if (groupMenuOverlay) {
      closeOverlay(groupMenuOverlay);
    } else {
      openGroupChatMenu();
    }
  }
);

/* =========================================
   18. 초기화
========================================= */

async function initializeGroupChat() {
  try {
    const userId = await getGroupUserId();

    if (!userId) return;

    await loadGroupChatRooms();
    startGroupListRealtime();

  } catch (error) {
    console.error(
      "단체 채팅 초기화 오류:",
      error
    );
  }
}

window.addEventListener(
  "inhaGoLoginSuccess",
  initializeGroupChat
);

if (document.readyState === "loading") {
  document.addEventListener(
    "DOMContentLoaded",
    initializeGroupChat
  );
} else {
  initializeGroupChat();
}

/* =========================================
   19. 페이지 종료 시 구독 정리
========================================= */

window.addEventListener(
  "pagehide",
  () => {
    stopGroupChatRealtime();

    if (groupListChannel) {
      supabaseDev.removeChannel(groupListChannel);
      groupListChannel = null;
    }
  }
);
