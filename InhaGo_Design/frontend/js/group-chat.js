
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

