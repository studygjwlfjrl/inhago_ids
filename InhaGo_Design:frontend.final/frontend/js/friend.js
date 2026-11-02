
/* InhaGo 친구 관리 기능 - 데모 버전 */

(() => {
  "use strict";

  const STORAGE_KEY = "inhago_friends_demo_v1";

  const sampleUsers = [
    { id: "u1", name: "김인하", studentId: "20260001" },
    { id: "u2", name: "박지민", studentId: "20260002" },
    { id: "u3", name: "이수연", studentId: "20260003" },
    { id: "u4", name: "최민준", studentId: "20260004" }
  ];

  function loadData() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && Array.isArray(saved.friends) &&
          Array.isArray(saved.requests)) {
        return saved;
      }
    } catch (error) {
      console.warn("친구 데이터 불러오기 실패", error);
    }

    return {
      friends: ["u1"],
      requests: [
        { userId: "u2", type: "received" }
      ]
    };
  }

  let data = loadData();

  function saveData() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function findUser(id) {
    return sampleUsers.find(user => user.id === id);
  }

  function notify(message) {
    const toast = document.getElementById("toast");

    if (toast) {
      toast.textContent = message;
      toast.style.display = "block";
      setTimeout(() => {
        if (toast.textContent === message) {
          toast.style.display = "none";
        }
      }, 2600);
    }
  }

  function createButton(label, action, userId, secondary = false) {
    const button = document.createElement("button");
    button.className = secondary
      ? "friend-btn secondary"
      : "friend-btn";
    button.textContent = label;
    button.type = "button";

    button.addEventListener("click", () => {
      handleAction(action, userId);
    });

    return button;
  }

  function createUserRow(user, buttons) {
    const row = document.createElement("div");
    row.className = "friend-item";

    const info = document.createElement("div");
    info.className = "friend-info";

    const name = document.createElement("strong");
    name.textContent = user.name;

    const studentId = document.createElement("small");
    studentId.textContent = `학번: ${user.studentId}`;

    info.append(name, studentId);

    const actions = document.createElement("div");
    actions.className = "friend-actions";

    buttons.forEach(button => {
      actions.appendChild(
        createButton(
          button.label,
          button.action,
          user.id,
          button.secondary
        )
      );
    });

    row.append(info, actions);
    return row;
  }

  function handleAction(action, userId) {
    const isFriend = data.friends.includes(userId);
    const request = data.requests.find(
      item => item.userId === userId
    );

    if (action === "request") {
      if (isFriend || request) return;

      data.requests.push({
        userId,
        type: "sent"
      });

      notify("친구 요청을 보냈습니다. (데모)");
    }

    if (action === "accept") {
      if (!request || request.type !== "received") return;

      data.requests = data.requests.filter(
        item => item.userId !== userId
      );

      if (!isFriend) data.friends.push(userId);

      notify("친구 요청을 수락했습니다.");
    }

    if (action === "reject") {
      if (!request || request.type !== "received") return;

      data.requests = data.requests.filter(
        item => item.userId !== userId
      );

      notify("친구 요청을 거절했습니다.");
    }

    if (action === "cancel") {
      if (!request || request.type !== "sent") return;

      data.requests = data.requests.filter(
        item => item.userId !== userId
      );

      notify("친구 요청을 취소했습니다.");
    }

    if (action === "remove") {
      if (!isFriend) return;

      data.friends = data.friends.filter(id => id !== userId);
      notify("친구를 삭제했습니다.");
    }

    saveData();
    renderFriends();
  }

  function renderList(containerId, users, getButtons) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.replaceChildren();

    if (users.length === 0) {
      const empty = document.createElement("p");
      empty.className = "muted";
      empty.textContent = "표시할 사용자가 없습니다.";
      container.appendChild(empty);
      return;
    }

    users.forEach(user => {
      container.appendChild(
        createUserRow(user, getButtons(user))
      );
    });
  }

  function renderFriends() {
    const friends = sampleUsers.filter(user =>
      data.friends.includes(user.id)
    );

    renderList("friend-list", friends, () => [
      {
        label: "친구 삭제",
        action: "remove",
        secondary: true
      }
    ]);

    const received = sampleUsers.filter(user =>
      data.requests.some(
        item => item.userId === user.id &&
                item.type === "received"
      )
    );

    renderList("friend-requests", received, () => [
      { label: "수락", action: "accept" },
      {
        label: "거절",
        action: "reject",
        secondary: true
      }
    ]);

    const sent = sampleUsers.filter(user =>
      data.requests.some(
        item => item.userId === user.id &&
                item.type === "sent"
      )
    );

    renderList("friend-sent", sent, () => [
      {
        label: "요청 취소",
        action: "cancel",
        secondary: true
      }
    ]);

    searchFriends();
  }

  function searchFriends() {
    const input = document.getElementById("friend-search-input");
    if (!input) return;

    const keyword = input.value.trim().toLowerCase();

    const users = keyword
      ? sampleUsers.filter(user =>
          user.name.toLowerCase().includes(keyword) ||
          user.studentId.includes(keyword)
        )
      : [];

    renderList("friend-search-results", users, user => {
      if (data.friends.includes(user.id)) return [];

      const request = data.requests.find(
        item => item.userId === user.id
      );

      if (request) return [];

      return [
        { label: "친구 요청", action: "request" }
      ];
    });
  }

  function init() {
    const input = document.getElementById("friend-search-input");

    if (input) {
      input.addEventListener("input", searchFriends);
    }

    renderFriends();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
