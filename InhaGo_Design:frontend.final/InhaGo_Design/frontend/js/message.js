
/* InhaGo 1:1 쪽지 기능 - 데모 버전 */

(() => {
  "use strict";

  const MESSAGE_KEY = "inhago_messages_demo_v1";
  const FRIEND_KEY = "inhago_friends_demo_v1";

  const users = [
    { id: "u1", name: "김인하" },
    { id: "u2", name: "박지민" },
    { id: "u3", name: "이수연" },
    { id: "u4", name: "최민준" }
  ];

  const myId = "me";

  function loadMessages() {
    try {
      const saved = JSON.parse(localStorage.getItem(MESSAGE_KEY));
      if (Array.isArray(saved)) return saved;
    } catch (error) {
      console.warn("쪽지 데이터 불러오기 실패", error);
    }

    return [];
  }

  let messages = loadMessages();

  function saveMessages() {
    localStorage.setItem(MESSAGE_KEY, JSON.stringify(messages));
  }

  function getFriends() {
    try {
      const data = JSON.parse(localStorage.getItem(FRIEND_KEY));
      if (data && Array.isArray(data.friends)) {
        return users.filter(user =>
          data.friends.includes(user.id)
        );
      }
    } catch (error) {
      console.warn("친구 데이터 불러오기 실패", error);
    }

    return [users[0]];
  }

  function getName(id) {
    if (id === myId) return "나";
    const user = users.find(item => item.id === id);
    return user ? user.name : "알 수 없는 사용자";
  }

  function formatTime(date) {
    return new Date(date).toLocaleString("ko-KR");
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

  function createMessageItem(message, received = false) {
    const item = document.createElement("div");
    item.className = "message-item";

    const name = document.createElement("strong");
    name.textContent = received
      ? `보낸 사람: ${getName(message.from)}`
      : `받는 사람: ${getName(message.to)}`;

    const content = document.createElement("p");
    content.textContent = message.content;

    const time = document.createElement("small");
    time.className = "message-time";
    time.textContent = formatTime(message.createdAt);

    item.append(name, content, time);
    return item;
  }

  function renderMessageList(containerId, list, received) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.replaceChildren();

    if (list.length === 0) {
      const empty = document.createElement("p");
      empty.className = "message-empty";
      empty.textContent = "쪽지가 없습니다.";
      container.appendChild(empty);
      return;
    }

    [...list].reverse().forEach(message => {
      container.appendChild(
        createMessageItem(message, received)
      );
    });
  }

  function renderMessages() {
    const select = document.getElementById("message-recipient");
    const previous = select ? select.value : "";

    if (select) {
      select.replaceChildren();

      getFriends().forEach(friend => {
        const option = document.createElement("option");
        option.value = friend.id;
        option.textContent = friend.name;
        select.appendChild(option);
      });

      if (getFriends().some(friend => friend.id === previous)) {
        select.value = previous;
      }
    }

    renderMessageList(
      "received-messages",
      messages.filter(message => message.to === myId),
      true
    );

    renderMessageList(
      "sent-messages",
      messages.filter(message => message.from === myId),
      false
    );
  }

  function sendMessage(event) {
    event.preventDefault();

    const select = document.getElementById("message-recipient");
    const textarea = document.getElementById("message-content");

    if (!select || !textarea) return;

    const recipient = select.value;
    const content = textarea.value.trim();

    if (!getFriends().some(friend => friend.id === recipient)) {
      showNotice("쪽지를 보낼 친구를 선택해 주세요.");
      return;
    }

    if (!content) {
      showNotice("쪽지 내용을 입력해 주세요.");
      return;
    }

    messages.push({
      id: crypto.randomUUID(),
      from: myId,
      to: recipient,
      content,
      createdAt: new Date().toISOString()
    });

    saveMessages();
    textarea.value = "";
    renderMessages();

    showNotice("쪽지를 보냈습니다. (데모)");
  }

  function init() {
    const form = document.getElementById("message-form");

    if (!form) return;

    form.addEventListener("submit", sendMessage);
    renderMessages();

    document.querySelectorAll('[data-page="message"]')
      .forEach(button => {
        button.addEventListener("click", renderMessages);
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
