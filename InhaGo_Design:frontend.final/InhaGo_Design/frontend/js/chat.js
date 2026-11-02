
/* InhaGo 모임별 채팅 기능 - 데모 버전 */

(() => {
  "use strict";

  const MEETING_KEY = "inhago_step3_demo_v2";
  const CHAT_KEY = "inhago_chat_demo_v1";

  let currentRoomId = null;

  function loadJSON(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key));
      return value ?? fallback;
    } catch (error) {
      console.warn("데이터 불러오기 실패:", error);
      return fallback;
    }
  }

  function getMeetings() {
    const state = loadJSON(MEETING_KEY, {});
    return Array.isArray(state.meetings)
      ? state.meetings
      : [];
  }

  function getJoinedMeetings() {
    const state = loadJSON(MEETING_KEY, {});
    const meetings = getMeetings();
    const joined = Array.isArray(state.joined)
      ? state.joined
      : [];

    return meetings.filter(meeting =>
      joined.includes(meeting.id)
    );
  }

  function loadChats() {
    const data = loadJSON(CHAT_KEY, {});
    return data && typeof data === "object" &&
      !Array.isArray(data) ? data : {};
  }

  let chats = loadChats();

  function saveChats() {
    localStorage.setItem(CHAT_KEY, JSON.stringify(chats));
  }

  function showNotice(text) {
    const toast = document.getElementById("toast");
    if (!toast) return;

    toast.textContent = text;
    toast.style.display = "block";

    setTimeout(() => {
      if (toast.textContent === text) {
        toast.style.display = "none";
      }
    }, 2600);
  }

  function formatTime(date) {
    return new Date(date).toLocaleString("ko-KR");
  }

  function renderRooms() {
    const container = document.getElementById("chat-room-list");
    if (!container) return;

    container.replaceChildren();

    const meetings = getJoinedMeetings();

    if (meetings.length === 0) {
      const empty = document.createElement("p");
      empty.className = "chat-empty";
      empty.textContent =
        "참여한 모임이 없습니다. 먼저 모임에 참여해 주세요.";
      container.appendChild(empty);
      return;
    }

    meetings.forEach(meeting => {
      const item = document.createElement("div");
      item.className = "chat-room-item";

      const info = document.createElement("div");
      info.className = "chat-room-info";

      const title = document.createElement("strong");
      title.textContent = meeting.title;

      const place = document.createElement("small");
      place.textContent = `장소: ${meeting.place}`;

      info.append(title, place);

      const button = document.createElement("button");
      button.type = "button";
      button.className = "chat-btn";
      button.textContent = "채팅방 입장";

      button.addEventListener("click", () => {
        openRoom(meeting.id);
      });

      item.append(info, button);
      container.appendChild(item);
    });
  }

  function openRoom(roomId) {
    const meeting = getJoinedMeetings().find(
      item => item.id === roomId
    );

    if (!meeting) {
      showNotice("참여한 모임만 입장할 수 있습니다.");
      return;
    }

    currentRoomId = roomId;

    const room = document.getElementById("chat-room");
    const title = document.getElementById("chat-room-title");

    if (room) room.hidden = false;
    if (title) title.textContent = meeting.title;

    renderMessages();
  }

  function renderMessages() {
    const container = document.getElementById("chat-messages");
    if (!container || currentRoomId === null) return;

    container.replaceChildren();

    const messages = chats[String(currentRoomId)] || [];

    if (messages.length === 0) {
      const empty = document.createElement("p");
      empty.className = "chat-empty";
      empty.textContent = "아직 메시지가 없습니다.";
      container.appendChild(empty);
      return;
    }

    messages.forEach(message => {
      const wrapper = document.createElement("div");
      wrapper.className = "chat-message mine";

      const bubble = document.createElement("div");
      bubble.className = "chat-bubble";
      bubble.textContent = message.content;

      const time = document.createElement("small");
      time.textContent = formatTime(message.createdAt);

      wrapper.append(bubble, time);
      container.appendChild(wrapper);
    });

    container.scrollTop = container.scrollHeight;
  }

  function sendMessage(event) {
    event.preventDefault();

    if (currentRoomId === null) return;

    const allowed = getJoinedMeetings().some(
      meeting => meeting.id === currentRoomId
    );

    if (!allowed) {
      showNotice("참여한 모임만 메시지를 보낼 수 있습니다.");
      return;
    }

    const input = document.getElementById("chat-input");
    if (!input) return;

    const content = input.value.trim();

    if (!content) return;

    const key = String(currentRoomId);

    if (!Array.isArray(chats[key])) {
      chats[key] = [];
    }

    chats[key].push({
      id: crypto.randomUUID(),
      sender: "me",
      content,
      createdAt: new Date().toISOString()
    });

    saveChats();
    input.value = "";

    renderMessages();
    showNotice("메시지를 보냈습니다. (데모)");
  }

  function init() {
    const form = document.getElementById("chat-form");

    if (!form) return;

    form.addEventListener("submit", sendMessage);

    document.querySelectorAll('[data-page="chat"]')
      .forEach(button => {
        button.addEventListener("click", renderRooms);
      });

    renderRooms();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
