
import { supabase as supabaseDev } from "./supabase.js";

// 인하고 친구 단체 채팅 화면 전환
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
  meetingTab.addEventListener("click", () => {
    switchChatTab("meeting");
  });

  groupTab.addEventListener("click", () => {
    switchChatTab("group");
  });
}

// 단체 채팅방 만들기
const createGroupChatBtn =
  document.getElementById("create-group-chat-btn");

if (createGroupChatBtn) {
  createGroupChatBtn.addEventListener("click", async () => {
    const roomName = prompt("단체 채팅방 이름을 입력하세요.");

    if (roomName === null) return;

    if (!roomName.trim()) {
      alert("채팅방 이름을 입력해주세요.");
      return;
    }

    const { data: userData, error: userError } =
      await supabaseDev.auth.getUser();

    if (userError || !userData?.user) {
      alert("로그인이 필요합니다.");
      return;
    }

    // 다음 단계에서 친구 선택 UI를 연결합니다.
    alert("채팅방 이름 확인 완료! 다음 단계에서 친구 선택 기능을 연결합니다.");
  });
}
