
import { supabase as supabaseDev } from "./supabase.js";

/* =========================================
   1. 채팅 화면 전환
========================================= */

const meetingTab = document.getElementById("meeting-chat-tab");
const groupTab = document.getElementById("group-chat-tab");

const meetingView = document.querySelector(
  "#chat-page .chat-container"
);
const groupView = document.getElementById("group-chat-view");

function switchChatTab(type) {
  const isGroup = type === "group";

  if (!meetingView || !groupView) return;

  meetingView.hidden = isGroup;
  groupView.hidden = !isGroup;

  meetingTab?.classList.toggle("active", !isGroup);
  groupTab?.classList.toggle("active", isGroup);
}

if (meetingTab && groupTab && meetingView && groupView) {
  meetingTab.addEventListener("click", () => {
    switchChatTab("meeting");
  });

  groupTab.addEventListener("click", () => {
    switchChatTab("group");
  });
}

/* =========================================
   2. 친구 목록 조회
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
      (friendships || []).map(friend =>
        friend.requester_id === userId
          ? friend.receiver_id
          : friend.requester_id
      )
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
    name:
      profileMap.get(id)?.nickname ||
      profileMap.get(id)?.real_name ||
      "이름 미설정"
  }));
}

/* =========================================
   3. 단체 채팅방 만들기
========================================= */

const createGroupChatBtn = document.getElementById(
  "create-group-chat-btn"
);

if (createGroupChatBtn) {
  createGroupChatBtn.addEventListener("click", async () => {
    createGroupChatBtn.disabled = true;

    try {
      const { data: userData, error: userError } =
        await supabaseDev.auth.getUser();

      if (userError || !userData?.user) {
        alert("로그인이 필요합니다.");
        return;
      }

      const friends = await loadAcceptedFriends(
        userData.user.id
      );

      if (friends.length === 0) {
        alert("초대할 수 있는 친구가 없습니다.");
        return;
      }

      const roomName = prompt(
        "단체 채팅방 이름을 입력하세요."
      );

      if (roomName === null) return;

      if (
        !roomName.trim() ||
        roomName.trim().length > 100
      ) {
        alert("채팅방 이름은 1~100자로 입력해주세요.");
        return;
      }

      const overlay = document.createElement("div");

      overlay.style.cssText = `
        position:fixed;
        inset:0;
        background:rgba(0,0,0,0.5);
        display:flex;
        align-items:center;
        justify-content:center;
        z-index:9999;
      `;

      const panel = document.createElement("div");

      panel.style.cssText = `
        background:white;
        padding:24px;
        border-radius:12px;
        width:min(90vw,400px);
        max-height:80vh;
        overflow-y:auto;
        color:#222;
      `;

      const title = document.createElement("h3");
      title.textContent = "초대할 친구 선택";

      const friendList = document.createElement("div");

      friends.forEach(friend => {
        const label = document.createElement("label");

        label.style.cssText = `
          display:flex;
          gap:10px;
          padding:10px;
          align-items:center;
        `;

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = friend.id;

        const name = document.createElement("span");
        name.textContent = friend.name;

        label.append(checkbox, name);
        friendList.appendChild(label);
      });

      const cancelBtn = document.createElement("button");
      cancelBtn.textContent = "취소";
      cancelBtn.type = "button";

      const confirmBtn = document.createElement("button");
      confirmBtn.textContent = "채팅방 만들기";
      confirmBtn.type = "button";

      const actions = document.createElement("div");

      actions.style.cssText = `
        display:flex;
        justify-content:flex-end;
        gap:12px;
        margin-top:20px;
      `;

      actions.append(cancelBtn, confirmBtn);
      panel.append(title, friendList, actions);
      overlay.appendChild(panel);
      document.body.appendChild(overlay);

      cancelBtn.addEventListener("click", () => {
        overlay.remove();
      });

      confirmBtn.addEventListener("click", async () => {
        const selectedIds = [
          ...friendList.querySelectorAll(
            'input[type="checkbox"]:checked'
          )
        ].map(input => input.value);

        if (selectedIds.length === 0) {
          alert("친구를 최소 1명 선택해주세요.");
          return;
        }

        confirmBtn.disabled = true;

        try {
          const { data: roomId, error: createError } =
            await supabaseDev.rpc("create_group_chat", {
              p_name: roomName.trim(),
              p_friend_ids: selectedIds
            });

          if (createError) throw createError;

          overlay.remove();

          alert("단체 채팅방 생성 성공!");

          console.log("생성된 채팅방 ID:", roomId);

          await loadGroupChatRooms();

        } catch (error) {
          console.error("채팅방 생성 오류:", error);
          alert(
            "채팅방 생성 실패: " + error.message
          );
        } finally {
          confirmBtn.disabled = false;
        }
      });

    } catch (error) {
      console.error(error);

      alert(
        "친구 목록 조회 실패: " + error.message
      );

    } finally {
      createGroupChatBtn.disabled = false;
    }
  });
}

/* =========================================
   4. 단체 채팅방 목록 및 메시지
========================================= */

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

let activeGroupRoomId = null;
let currentGroupUserId = null;
// 단체 채팅 실시간 구독 관리
let groupChatChannel = null;

function stopGroupChatRealtime() {
  if (groupChatChannel) {
    const oldChannel = groupChatChannel;
    groupChatChannel = null;
    supabaseDev.removeChannel(oldChannel);
  }
}

function startGroupChatRealtime(roomId) {
  stopGroupChatRealtime();

  const channel = supabaseDev
    .channel(`group-chat-${roomId}`)
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
      }
    )
    .subscribe(status => {
      if (status === "SUBSCRIBED") {
        console.log("실시간 채팅 연결 완료:", roomId);
      }
    });

  groupChatChannel = channel;
}
/* 현재 로그인 사용자 확인 */

async function getGroupUserId() {
  const { data, error } =
    await supabaseDev.auth.getUser();

  if (error) throw error;

  currentGroupUserId = data?.user?.id || null;

  return currentGroupUserId;
}

/* =========================================
   5. 단체 채팅방 목록 불러오기
========================================= */

async function loadGroupChatRooms() {
  if (!groupRoomList) return;

  groupRoomList.textContent =
    "채팅방을 불러오는 중...";

  try {
    const userId = await getGroupUserId();

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

    const roomIds = [
      ...new Set(
        (memberships || []).map(m => m.room_id)
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
      const aTime =
        latestMessages.get(a.id)?.created_at ||
        a.created_at;

      const bTime =
        latestMessages.get(b.id)?.created_at ||
        b.created_at;

      return new Date(bTime) - new Date(aTime);
    });

    groupRoomList.replaceChildren();

    for (const room of rooms) {
      const lastMessage = latestMessages.get(room.id);
      const memberCount =
        memberCounts.get(room.id) || 0;

      const button = document.createElement("button");
      button.type = "button";
      button.className = "group-chat-list-item";

      const avatar = document.createElement("div");
      avatar.className = "group-chat-list-avatar";
      avatar.textContent = "👥";

      const info = document.createElement("div");
      info.className = "group-chat-list-info";

      const title = document.createElement("div");
      title.className = "group-chat-list-title";

      const name = document.createElement("span");
      name.textContent = room.name;

      const count = document.createElement("span");
      count.className = "group-chat-member-count";
      count.textContent = `${memberCount}명`;

      title.append(name, count);

      const preview = document.createElement("div");
      preview.className = "group-chat-list-preview";

      preview.textContent = lastMessage
        ? `${
            lastMessage.sender_id === userId
              ? "나: "
              : ""
          }${lastMessage.content}`
        : "새로운 대화를 시작해 보세요.";

      info.append(title, preview);

      const time = document.createElement("span");
      time.className = "group-chat-list-time";

      const dateValue =
        lastMessage?.created_at ||
        room.created_at;

      if (dateValue) {
        const date = new Date(dateValue);
        const today = new Date();

        time.textContent =
          date.toDateString() === today.toDateString()
            ? date.toLocaleTimeString("ko-KR", {
                hour: "numeric",
                minute: "2-digit"
              })
            : date.toLocaleDateString("ko-KR", {
                month: "numeric",
                day: "numeric"
              });
      }

      button.append(avatar, info, time);

      button.addEventListener("click", () => {
        openGroupChatRoom(room);
      });

      groupRoomList.appendChild(button);
    }

  } catch (error) {
    console.error(
      "단체 채팅방 목록 오류:",
      error
    );

    groupRoomList.textContent =
      "채팅방 목록을 불러오지 못했습니다.";
  }
}

/* =========================================
   6. 단체 채팅방 열기
========================================= */

async function openGroupChatRoom(room) {
  activeGroupRoomId = room.id;

  groupListView.hidden = true;
  groupRoomView.hidden = false;
  groupRoomTitle.textContent = room.name;
   startGroupChatRealtime(room.id);

  await loadGroupMessages(room.id);
}

/* =========================================
   7. 메시지 목록 불러오기
   실제 작성자 닉네임 표시
========================================= */

async function loadGroupMessages(roomId) {
  if (!groupMessages || !roomId) return;

  const { data: messages, error } =
    await supabaseDev
      .from("group_chat_messages")
      .select(
        "id, sender_id, content, created_at"
      )
      .eq("room_id", roomId)
      .order("created_at", {
        ascending: true
      })
      .limit(200);

  if (error) {
    console.error("메시지 조회 오류:", error);

    if (activeGroupRoomId === roomId) {
      groupMessages.textContent =
        "메시지를 불러오지 못했습니다.";
    }

    return;
  }

  if (activeGroupRoomId !== roomId) return;

  const senderIds = [
    ...new Set(
      (messages || []).map(
        message => message.sender_id
      )
    )
  ];

  let profiles = [];

  if (senderIds.length > 0) {
    const {
      data,
      error: profileError
    } = await supabaseDev
      .from("profiles")
      .select("id, nickname, real_name")
      .in("id", senderIds);

    if (profileError) {
      console.error(
        "프로필 조회 오류:",
        profileError
      );
    } else {
      profiles = data || [];
    }
  }

  if (activeGroupRoomId !== roomId) return;

  const profileMap = new Map(
    profiles.map(profile => [
      profile.id,
      profile
    ])
  );

  groupMessages.replaceChildren();

  if (!messages?.length) {
    groupMessages.textContent =
      "아직 메시지가 없습니다.";
    return;
  }

  for (const message of messages) {
    const item = document.createElement("div");

    const isMine =
      message.sender_id === currentGroupUserId;

    item.style.cssText = `
      padding:10px;
      margin:8px 0;
      border-radius:10px;
      background:${
        isMine ? "#dceaff" : "#f1f1f1"
      };
      color:#222;
      text-align:${
        isMine ? "right" : "left"
      };
      overflow-wrap:anywhere;
    `;

    const sender = document.createElement("strong");

    const profile = profileMap.get(
      message.sender_id
    );

    const senderName =
      profile?.nickname ||
      profile?.real_name ||
      "이름 미설정";

    sender.textContent =
      isMine ? "나" : senderName;

    const content = document.createElement("div");
    content.textContent = message.content;

    item.append(sender, content);
    groupMessages.appendChild(item);
  }

  groupMessages.scrollTop =
    groupMessages.scrollHeight;
}

/* =========================================
   8. 메시지 전송
========================================= */

if (groupForm && groupInput) {
  groupForm.addEventListener(
    "submit",
    async event => {
      event.preventDefault();

      const roomId = activeGroupRoomId;
      const content = groupInput.value.trim();

      if (!roomId || !content) return;

      const submitBtn = groupForm.querySelector(
        'button[type="submit"]'
      );

      if (submitBtn) {
        submitBtn.disabled = true;
      }

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

        groupInput.value = "";

        await loadGroupMessages(roomId);

      } catch (error) {
        console.error(
          "메시지 전송 오류:",
          error
        );

        alert(
          "메시지 전송 실패: " +
          error.message
        );

      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
        }
      }
    }
  );
}

/* =========================================
   9. 목록으로 돌아가기
========================================= */

groupBackBtn?.addEventListener("click", () => {
  activeGroupRoomId = null;
  stopGroupChatRealtime();

  groupRoomView.hidden = true;
  groupListView.hidden = false;

  loadGroupChatRooms();
});

/* =========================================
   10. 단체 채팅 탭 새로고침
========================================= */

groupTab?.addEventListener("click", () => {
  if (activeGroupRoomId) {
    loadGroupMessages(activeGroupRoomId);
  } else {
    loadGroupChatRooms();
  }
});

/* =========================================
   11. 단체 채팅방 관리 메뉴
========================================= */

const groupMenuBtn = document.getElementById(
  "group-chat-menu-btn"
);

let groupMenuOverlay = null;

async function openGroupChatMenu() {
  if (!activeGroupRoomId) return;

  const roomId = activeGroupRoomId;

  const overlay = document.createElement("div");
  overlay.className = "group-chat-menu-overlay";

  const panel = document.createElement("div");
  panel.className = "group-chat-menu-panel";

  const header = document.createElement("div");
  header.className = "group-chat-menu-header";

  const title = document.createElement("h3");
  title.textContent = "채팅방 서랍";

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.textContent = "✕";
  closeBtn.setAttribute("aria-label", "닫기");

  header.append(title, closeBtn);

  const memberTitle = document.createElement("h4");
  memberTitle.textContent = "대화 상대";

  const memberList = document.createElement("div");
  memberList.className = "group-chat-member-list";

  memberList.textContent =
    "참여자를 불러오는 중...";

  const inviteBtn = document.createElement("button");
  inviteBtn.type = "button";
  inviteBtn.className = "group-chat-menu-action";
  inviteBtn.textContent = "＋ 친구 초대하기";

  const leaveBtn = document.createElement("button");
  leaveBtn.type = "button";

  leaveBtn.className =
    "group-chat-menu-action group-chat-leave-btn";

  leaveBtn.textContent = "채팅방 나가기";

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

  function closeMenu() {
    overlay.remove();

    if (groupMenuOverlay === overlay) {
      groupMenuOverlay = null;

      groupMenuBtn?.setAttribute(
        "aria-expanded",
        "false"
      );
    }
  }

  closeBtn.addEventListener(
    "click",
    closeMenu
  );

  overlay.addEventListener("click", event => {
    if (event.target === overlay) {
      closeMenu();
    }
  });

  /* 참여자 목록 불러오기 */

  try {
    const { data: members, error: memberError } =
      await supabaseDev
        .from("group_chat_members")
        .select("user_id")
        .eq("room_id", roomId);

    if (memberError) throw memberError;

    const memberIds = (members || []).map(
      member => member.user_id
    );

    let profiles = [];

    if (memberIds.length > 0) {
      const { data, error } =
        await supabaseDev
          .from("profiles")
          .select("id, nickname, real_name")
          .in("id", memberIds);

      if (error) throw error;

      profiles = data || [];
    }

    if (!overlay.isConnected) return;

    const profileMap = new Map(
      profiles.map(profile => [
        profile.id,
        profile
      ])
    );

    memberList.replaceChildren();

    memberTitle.textContent =
      `대화 상대 ${memberIds.length}명`;

    for (const id of memberIds) {
      const row = document.createElement("div");
      row.className = "group-chat-member-item";

      const avatar = document.createElement("div");
      avatar.className = "group-chat-member-avatar";
      avatar.textContent = "👤";

      const name = document.createElement("span");

      const profile = profileMap.get(id);

      const displayName =
        profile?.nickname ||
        profile?.real_name ||
        "이름 미설정";

      name.textContent =
        id === currentGroupUserId
          ? `${displayName} (나)`
          : displayName;

      row.append(avatar, name);
      memberList.appendChild(row);
    }

  } catch (error) {
    console.error(
      "참여자 조회 오류:",
      error
    );

    if (overlay.isConnected) {
      memberList.textContent =
        "참여자 목록을 불러오지 못했습니다.";
    }
  }

  /* =====================================
     12. 친구 초대하기
  ===================================== */

  inviteBtn.addEventListener("click", async () => {
    inviteBtn.disabled = true;

    try {
      const userId = await getGroupUserId();

      if (!userId) {
        alert("로그인이 필요합니다.");
        return;
      }

      const friends = await loadAcceptedFriends(userId);

      const { data: members, error: memberError } =
        await supabaseDev
          .from("group_chat_members")
          .select("user_id")
          .eq("room_id", roomId);

      if (memberError) throw memberError;

      const memberIds = new Set(
        (members || []).map(
          member => member.user_id
        )
      );

      const availableFriends = friends.filter(
        friend => !memberIds.has(friend.id)
      );

      if (availableFriends.length === 0) {
        alert("초대할 수 있는 친구가 없습니다.");
        return;
      }

      const inviteOverlay =
        document.createElement("div");

      inviteOverlay.className =
        "group-chat-menu-overlay";

      const invitePanel =
        document.createElement("div");

      invitePanel.className =
        "group-chat-menu-panel";

      const inviteTitle =
        document.createElement("h3");

      inviteTitle.textContent = "친구 초대하기";

      const friendList =
        document.createElement("div");

      friendList.className =
        "group-chat-member-list";

      const checkboxes = [];

      for (const friend of availableFriends) {
        const label =
          document.createElement("label");

        label.className =
          "group-chat-member-item";

        const checkbox =
          document.createElement("input");

        checkbox.type = "checkbox";
        checkbox.value = friend.id;

        const name =
          document.createElement("span");

        name.textContent = friend.name;

        label.append(checkbox, name);
        friendList.appendChild(label);
        checkboxes.push(checkbox);
      }

      const confirmBtn =
        document.createElement("button");

      confirmBtn.type = "button";
      confirmBtn.className =
        "group-chat-menu-action";

      confirmBtn.textContent =
        "선택한 친구 초대";

      const cancelBtn =
        document.createElement("button");

      cancelBtn.type = "button";
      cancelBtn.className =
        "group-chat-menu-action";

      cancelBtn.textContent = "취소";

      invitePanel.append(
        inviteTitle,
        friendList,
        confirmBtn,
        cancelBtn
      );

      inviteOverlay.appendChild(invitePanel);
      document.body.appendChild(inviteOverlay);

      cancelBtn.addEventListener("click", () => {
        inviteOverlay.remove();
      });

      confirmBtn.addEventListener(
        "click",
        async () => {
          const selectedIds = checkboxes
            .filter(checkbox => checkbox.checked)
            .map(checkbox => checkbox.value);

          if (selectedIds.length === 0) {
            alert("초대할 친구를 선택해주세요.");
            return;
          }

          confirmBtn.disabled = true;

          let invitedCount = 0;

          try {
            for (const friendId of selectedIds) {
              const { error } =
                await supabaseDev.rpc(
                  "invite_group_chat_friend",
                  {
                    p_room_id: roomId,
                    p_friend_id: friendId
                  }
                );

              if (error) throw error;

              invitedCount++;
            }

            inviteOverlay.remove();
            closeMenu();

            alert("친구 초대가 완료되었습니다.");

          } catch (error) {
            console.error(
              "친구 초대 오류:",
              error
            );

            alert(
              `${invitedCount}명 초대 완료. ` +
              `나머지 초대 중 오류: ${error.message}`
            );

          } finally {
            confirmBtn.disabled = false;
          }
        }
      );

    } catch (error) {
      console.error(
        "친구 목록 조회 오류:",
        error
      );

      alert(
        "친구 목록을 불러오지 못했습니다."
      );

    } finally {
      inviteBtn.disabled = false;
    }
  });

  /* =====================================
     13. 채팅방 나가기
  ===================================== */

  leaveBtn.addEventListener("click", async () => {
    const confirmed = confirm(
      "정말 채팅방을 나가시겠습니까?\n" +
      "나가면 내 채팅 목록에서 이 방이 사라집니다."
    );

    if (!confirmed) return;

    leaveBtn.disabled = true;

    try {
      const { error } = await supabaseDev.rpc(
        "leave_group_chat",
        {
          p_room_id: roomId
        }
      );

      if (error) throw error;

      activeGroupRoomId = null;
       stopGroupChatRealtime();

      closeMenu();

      groupRoomView.hidden = true;
      groupListView.hidden = false;

      await loadGroupChatRooms();

      alert("채팅방에서 나갔습니다.");

    } catch (error) {
      console.error(
        "채팅방 나가기 오류:",
        error
      );

      alert(
        "채팅방 나가기 실패: " +
        error.message
      );

    } finally {
      leaveBtn.disabled = false;
    }
  });
}

/* =========================================
   14. 관리 메뉴 버튼 이벤트
========================================= */

groupMenuBtn?.addEventListener("click", () => {
  if (groupMenuOverlay) {
    groupMenuOverlay.remove();
    groupMenuOverlay = null;

    groupMenuBtn.setAttribute(
      "aria-expanded",
      "false"
    );

  } else {
    openGroupChatMenu();
  }
});
