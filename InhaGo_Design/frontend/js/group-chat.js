// 인하고 친구 단체 채팅 화면 전환

const meetingTab = document.getElementById("meeting-chat-tab");
const groupTab = document.getElementById("group-chat-tab");

const meetingView = document.querySelector("#chat-page .chat-container");
const groupView = document.getElementById("group-chat-view");

function switchChatTab(type) {
  const isGroup = type === "group";

  meetingView.hidden = isGroup;
  groupView.hidden = !isGroup;

  meetingTab.classList.toggle("active", !isGroup);
  groupTab.classList.toggle("active", isGroup);
}

if (meetingTab && groupTab && meetingView && groupView) {
  meetingTab.addEventListener("click", () => {
    switchChatTab("meeting");
  });

  groupTab.addEventListener("click", () => {
    switchChatTab("group");
  });
}
// 친구 단체 채팅방 만들기 버튼
const createGroupChatBtn =
  document.getElementById("create-group-chat-btn");

if (createGroupChatBtn) {
  createGroupChatBtn.addEventListener("click", () => {
    alert("단체 채팅방 만들기 버튼 연결 성공!");
  });
}
