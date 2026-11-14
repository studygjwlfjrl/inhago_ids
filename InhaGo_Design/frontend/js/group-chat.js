
import { supabase as supabaseDev } from "./supabase.js";

// 1. 채팅 화면 전환
const meetingTab = document.getElementById("meeting-chat-tab");
const groupTab = document.getElementById("group-chat-tab");

const meetingView = document.querySelector("#chat-page .chat-container");
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
  meetingTab.addEventListener("click", () => switchChatTab("meeting"));
  groupTab.addEventListener("click", () => switchChatTab("group"));
}

// 2. 친구 목록 조회
async function loadAcceptedFriends(userId) {
  const { data: friendships, error } = await supabaseDev
    .from("friendships")
    .select("requester_id, receiver_id")
    .eq("status", "accepted")
    .or(`requester_id.eq.${userId},receiver_id.eq.${userId}`);

  if (error) throw error;

  const friendIds = [...new Set(
    (friendships || []).map(f =>
      f.requester_id === userId ? f.receiver_id : f.requester_id
    )
  )];

  if (friendIds.length === 0) return [];

  const { data: profiles, error: profileError } = await supabaseDev
    .from("profiles")
    .select("id, nickname, real_name")
    .in("id", friendIds);

  if (profileError) throw profileError;

  const profileMap = new Map(
    (profiles || []).map(profile => [profile.id, profile])
  );

  return friendIds.map(id => ({
    id,
    name:
      profileMap.get(id)?.nickname ||
      profileMap.get(id)?.real_name ||
      "이름 미설정"
  }));
}

// 3. 단체 채팅방 만들기
const createGroupChatBtn =
  document.getElementById("create-group-chat-btn");

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

      const friends = await loadAcceptedFriends(userData.user.id);

      if (friends.length === 0) {
        alert("초대할 수 있는 친구가 없습니다.");
        return;
      }

      const roomName = prompt("단체 채팅방 이름을 입력하세요.");

      if (roomName === null) return;

      if (!roomName.trim() || roomName.trim().length > 100) {
        alert("채팅방 이름은 1~100자로 입력해주세요.");
        return;
      }

      // 친구 선택 화면 생성
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
        label.style.cssText =
          "display:flex;gap:10px;padding:10px;align-items:center;";

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
      actions.style.cssText =
        "display:flex;justify-content:flex-end;gap:12px;margin-top:20px;";

      actions.append(cancelBtn, confirmBtn);
      panel.append(title, friendList, actions);
      overlay.appendChild(panel);
      document.body.appendChild(overlay);

      cancelBtn.addEventListener("click", () => overlay.remove());

      confirmBtn.addEventListener("click", async () => {
        const selectedIds = [...friendList.querySelectorAll(
          'input[type="checkbox"]:checked'
        )].map(input => input.value);

        if (selectedIds.length === 0) {
          alert("친구를 최소 1명 선택해주세요.");
          return;
        }

        confirmBtn.disabled = true;

        const { data: roomId, error: createError } =
          await supabaseDev.rpc("create_group_chat", {
            p_name: roomName.trim(),
            p_friend_ids: selectedIds
          });

        if (createError) {
          console.error(createError);
          alert("채팅방 생성 실패: " + createError.message);
          confirmBtn.disabled = false;
          return;
        }

        overlay.remove();
        alert("단체 채팅방 생성 성공!");

        console.log("생성된 채팅방 ID:", roomId);
      });

    } catch (error) {
      console.error(error);
      alert("친구 목록 조회 실패: " + error.message);
    } finally {
      createGroupChatBtn.disabled = false;
    }
  });
}

/* =========================================
   4. 친구 단체 채팅방 목록 및 메시지
========================================= */

const groupRoomList = document.getElementById("group-chat-room-list");
const groupListView = document.getElementById("group-chat-list-view");
const groupRoomView = document.getElementById("group-chat-room-view");
const groupBackBtn = document.getElementById("group-chat-back");
const groupRoomTitle = document.getElementById("group-chat-room-title");
const groupMessages = document.getElementById("group-chat-messages");
const groupForm = document.getElementById("group-chat-form");
const groupInput = document.getElementById("group-chat-input");

let activeGroupRoomId = null;
let currentGroupUserId = null;

// 현재 로그인 사용자 확인
async function getGroupUserId() {
  const { data, error } = await supabaseDev.auth.getUser();

  if (error) throw error;

  currentGroupUserId = data?.user?.id || null;
  return currentGroupUserId;
}

// 내가 참여한 단체 채팅방 목록 불러오기
async function loadGroupChatRooms() {
  if (!groupRoomList) return;

  groupRoomList.textContent = "채팅방을 불러오는 중...";

  try {
    const userId = await getGroupUserId();

    if (!userId) {
      groupRoomList.textContent = "로그인 후 이용할 수 있습니다.";
      return;
    }

    const { data: memberships, error: memberError } =
      await supabaseDev
        .from("group_chat_members")
        .select("room_id")
        .eq("user_id", userId);

    if (memberError) throw memberError;

    const roomIds = [
      ...new Set((memberships || []).map(m => m.room_id))
    ];

    if (roomIds.length === 0) {
      groupRoomList.textContent = "참여 중인 단체 채팅방이 없습니다.";
      return;
    }

    const { data: rooms, error: roomError } = await supabaseDev
      .from("group_chat_rooms")
      .select("id, name, created_at")
      .in("id", roomIds)
      .order("created_at", { ascending: false });

    if (roomError) throw roomError;

    groupRoomList.replaceChildren();

    for (const room of rooms || []) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = room.name;
      button.style.cssText = `
        display:block;
        width:100%;
        padding:15px;
        margin:8px 0;
        text-align:left;
        background:#f3f6fc;
        color:#222;
        border:1px solid #ddd;
        border-radius:10px;
        cursor:pointer;
      `;

      button.addEventListener("click", () => {
        openGroupChatRoom(room);
      });

      groupRoomList.appendChild(button);
    }

  } catch (error) {
    console.error("단체 채팅방 목록 오류:", error);
    groupRoomList.textContent =
      "채팅방 목록을 불러오지 못했습니다.";
  }
}

// 단체 채팅방 열기
async function openGroupChatRoom(room) {
  activeGroupRoomId = room.id;

  groupListView.hidden = true;
  groupRoomView.hidden = false;
  groupRoomTitle.textContent = room.name;

  await loadGroupMessages(room.id);
}

// 메시지 목록 불러오기
async function loadGroupMessages(roomId) {
  if (!groupMessages || !roomId) return;

  const { data: messages, error } = await supabaseDev
    .from("group_chat_messages")
    .select("id, sender_id, content, created_at")
    .eq("room_id", roomId)
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) {
    console.error("메시지 조회 오류:", error);
    groupMessages.textContent = "메시지를 불러오지 못했습니다.";
    return;
  }

  // 다른 채팅방으로 이동한 경우 이전 요청 결과 무시
  if (activeGroupRoomId !== roomId) return;

  groupMessages.replaceChildren();

  if (!messages?.length) {
    groupMessages.textContent = "아직 메시지가 없습니다.";
    return;
  }

  for (const message of messages) {
    const item = document.createElement("div");
    const isMine = message.sender_id === currentGroupUserId;

    item.style.cssText = `
      padding:10px;
      margin:8px 0;
      border-radius:10px;
      background:${isMine ? "#dceaff" : "#f1f1f1"};
      color:#222;
      text-align:${isMine ? "right" : "left"};
      overflow-wrap:anywhere;
    `;

    const sender = document.createElement("strong");
    sender.textContent = isMine ? "나" : "참여자";

    const content = document.createElement("div");
    content.textContent = message.content;

    item.append(sender, content);
    groupMessages.appendChild(item);
  }

  groupMessages.scrollTop = groupMessages.scrollHeight;
}

// 메시지 전송
if (groupForm && groupInput) {
  groupForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const roomId = activeGroupRoomId;
    const content = groupInput.value.trim();

    if (!roomId || !content) return;

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

      groupInput.value = "";

      await loadGroupMessages(roomId);

    } catch (error) {
      console.error("메시지 전송 오류:", error);
      alert("메시지 전송 실패: " + error.message);
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}

// 목록으로 돌아가기
groupBackBtn?.addEventListener("click", () => {
  activeGroupRoomId = null;
  groupRoomView.hidden = true;
  groupListView.hidden = false;

  loadGroupChatRooms();
});

// 단체 채팅 탭을 열면 채팅방 목록 새로고침
groupTab?.addEventListener("click", () => {
  if (activeGroupRoomId) {
    loadGroupMessages(activeGroupRoomId);
  } else {
    loadGroupChatRooms();
  }
});

