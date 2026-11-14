
/* InhaGo 1:1 실시간 채팅 - Supabase 연동 */

import { supabase as supabaseDev } from "./supabase.js";

(() => {
  "use strict";

  let currentUserId = null;
  let currentFriendId = null;
  let realtimeChannel = null;
  let realtimeVersion = 0;
  let messageVersion = 0;
  let friendVersion = 0;
  let sending = false;
  let currentFriendName = "";
  const friendNames = new Map();

  const knownFriends = new Set();

  async function getRealUserName(userId) {
    const { data, error } = await supabaseDev
      .from("profiles")
      .select("real_name")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      console.error("실명 조회 실패:", error.message);
      return "이름 조회 실패";
    }

    return data?.real_name
      ? data.real_name.split("/")[0].trim()
      : "이름 미등록";
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

  function showEmpty(container, text) {
    container.replaceChildren();

    const empty = document.createElement("p");
    empty.className = "message-empty";
    empty.textContent = text;

    container.appendChild(empty);
  }

  function formatTime(date) {
    return new Date(date).toLocaleString("ko-KR");
  }

  async function getCurrentUser() {
    const { data, error } =
      await supabaseDev.auth.getUser();

    if (error || !data.user) {
      console.error("로그인 확인 실패:", error);
      return null;
    }

    return data.user;
  }

  function unsubscribeRealtime() {
    realtimeVersion++;

    if (realtimeChannel) {
      supabaseDev.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }
  }

  function closeRoom() {
    unsubscribeRealtime();
    messageVersion++;

    currentFriendId = null;
    currentFriendName = "";
    document.getElementById("dm-list-view")?.removeAttribute("hidden");

    const room = document.getElementById("dm-room");
    const messages =
      document.getElementById("dm-messages");

    if (room) room.hidden = true;
    if (messages) messages.replaceChildren();
  }

  async function loadFriends() {
    const user = await getCurrentUser();

    if (!user) {
      currentUserId = null;
      return [];
    }

    currentUserId = user.id;

    const { data, error } = await supabaseDev
      .from("friendships")
      .select("requester_id, receiver_id")
      .or(
        `requester_id.eq.${user.id},receiver_id.eq.${user.id}`
      )
      .eq("status", "accepted");

    if (error) throw error;

    const friends = new Set();

    (data ?? []).forEach(friendship => {
      const friendId =
        friendship.requester_id === user.id
          ? friendship.receiver_id
          : friendship.requester_id;

      if (friendId && friendId !== user.id) {
        friends.add(friendId);
      }
    });

    return [...friends];
  }

  async function renderFriends() {
    const container =
      document.getElementById("dm-friend-list");

    if (!container) return;

    const version = ++friendVersion;

    showEmpty(container, "친구 목록을 불러오는 중...");

    try {
      const friends = await loadFriends();

      if (version !== friendVersion) return;

      knownFriends.clear();
      friendNames.clear();
      friends.forEach(id => knownFriends.add(id));

      container.replaceChildren();

      if (friends.length === 0) {
        closeRoom();
        showEmpty(
          container,
          "수락된 친구가 없습니다."
        );
        return;
      }

      if (
        currentFriendId &&
        !knownFriends.has(currentFriendId)
      ) {
        closeRoom();
      }

      for (const friendId of friends) {
        const item = document.createElement("div");
        item.className = "message-item";

        const name = document.createElement("strong");
        const displayName = await getRealUserName(friendId);
        if (version !== friendVersion) return;
        friendNames.set(friendId, displayName);
        name.textContent = displayName;

        const button = document.createElement("button");
        button.type = "button";
        button.className = "message-btn";
        button.textContent = "채팅방 입장";

        button.addEventListener("click", () => {
          openRoom(friendId);
        });

        item.append(name, button);
        container.appendChild(item);
      }
    } catch (error) {
      console.error("친구 목록 조회 실패:", error);

      if (version !== friendVersion) return;

      showEmpty(
        container,
        "친구 목록을 불러오지 못했습니다."
      );
    }
  }

  function appendMessage(container, message) {
    const wrapper = document.createElement("div");

    wrapper.className =
      message.sender_id === currentUserId
        ? "chat-message mine"
        : "chat-message";

    if (message.sender_id !== currentUserId) {
      const sender = document.createElement("strong");
      sender.className = "dm-sender-name";
      sender.textContent = currentFriendName || "상대방";
      wrapper.appendChild(sender);
    }

    const bubble = document.createElement("div");
    bubble.className = "chat-bubble";
    bubble.textContent = message.content;

    const time = document.createElement("small");
    time.textContent = formatTime(message.created_at);

    wrapper.append(bubble, time);
    container.appendChild(wrapper);
  }

  async function renderMessages() {
    const container =
      document.getElementById("dm-messages");

    if (
      !container ||
      !currentUserId ||
      !currentFriendId
    ) {
      return;
    }

    const userId = currentUserId;
    const friendId = currentFriendId;
    const version = ++messageVersion;

    // A -> B, B -> A 메시지를 함께 조회
    const { data, error } = await supabaseDev
      .from("direct_messages")
      .select(
        "id, sender_id, receiver_id, content, created_at"
      )
      .or(
        `and(sender_id.eq.${userId},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${userId})`
      )
      .order("created_at", { ascending: true })
      .limit(100);

    if (
      version !== messageVersion ||
      userId !== currentUserId ||
      friendId !== currentFriendId
    ) {
      return;
    }

    if (error) {
      console.error("1:1 메시지 조회 실패:", error);
      showEmpty(
        container,
        "메시지를 불러오지 못했습니다."
      );
      return;
    }


const messages = data ?? [];

if (messages.length === 0) {
  showEmpty(container, "아직 메시지가 없습니다.");
  return;
}

// 기존 메시지 중 이미 표시된 메시지는 유지
const existingMessages = new Map();

container.querySelectorAll("[data-message-id]")
  .forEach(element => {
    existingMessages.set(
      element.dataset.messageId,
      element
    );
  });

// 이전에 표시된 안내 문구만 제거
container.querySelectorAll(".message-empty")
  .forEach(element => element.remove());

// 새 메시지만 화면에 추가
messages.forEach(message => {
  const messageId = String(message.id);

  if (existingMessages.has(messageId)) {
    return;
  }

  const beforeCount = container.children.length;

  appendMessage(container, message);

  const newElement = container.children[beforeCount];

  if (newElement) {
    newElement.dataset.messageId = messageId;
  }
});


    container.scrollTop = container.scrollHeight;
  }

  function subscribeRealtime(friendId) {
    unsubscribeRealtime();

    const version = realtimeVersion;

    // 본인이 보내거나 받은 메시지 INSERT 감지
    const channel = supabaseDev
      .channel(
        `dm-${currentUserId}-${friendId}-${version}`
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "direct_messages"
        },
        payload => {
          if (
            version !== realtimeVersion ||
            currentFriendId !== friendId
          ) {
            return;
          }

          const message = payload.new;

          const belongsToRoom =
            (
              message.sender_id === currentUserId &&
              message.receiver_id === friendId
            ) ||
            (
              message.sender_id === friendId &&
              message.receiver_id === currentUserId
            );

          if (belongsToRoom) {
            console.log(
              "1:1 실시간 메시지 수신:",
              message
            );

            renderMessages();
          }
        }
      )
      .subscribe(status => {
        if (version !== realtimeVersion) return;

        console.log("1:1 Realtime 상태:", status);

        if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT"
        ) {
          console.error(
            "1:1 실시간 연결 오류:",
            status
          );
        }
      });

    realtimeChannel = channel;
  }

  async function openRoom(friendId) {
    if (!knownFriends.has(friendId)) {
      showNotice("수락된 친구만 채팅할 수 있습니다.");
      return;
    }

    const user = await getCurrentUser();

    if (!user) {
      showNotice("로그인이 필요합니다.");
      return;
    }

    currentUserId = user.id;
    currentFriendId = friendId;
    currentFriendName = friendNames.get(friendId) || "상대방";
    document.getElementById("dm-list-view")?.setAttribute("hidden", "");

    const room = document.getElementById("dm-room");
    const title =
      document.getElementById("dm-room-title");

    if (room) room.hidden = false;

    if (title) title.textContent = currentFriendName;
    if (!friendNames.has(friendId)) {
      const name = await getRealUserName(friendId);
      if (currentFriendId !== friendId) return;
      currentFriendName = name;
      friendNames.set(friendId, name);
      if (title) title.textContent = name;
    }

    subscribeRealtime(friendId);
    await renderMessages();
  }

  async function sendMessage(event) {
    event.preventDefault();

    if (sending) return;

    const form = event.currentTarget;
    const input = document.getElementById("dm-input");
    const button = form.querySelector(
      'button[type="submit"]'
    );

    if (!input) return;

    const content = input.value.trim();
    const friendId = currentFriendId;

    if (!friendId || !content) {
      showNotice("채팅방과 메시지를 확인해 주세요.");
      return;
    }

    if (!knownFriends.has(friendId)) {
      showNotice("수락된 친구만 채팅할 수 있습니다.");
      return;
    }

    sending = true;
    if (button) button.disabled = true;

    try {
      const user = await getCurrentUser();

      if (!user) {
        showNotice("로그인이 필요합니다.");
        return;
      }

      const { error } = await supabaseDev
        .from("direct_messages")
        .insert({
          sender_id: user.id,
          receiver_id: friendId,
          content
        });

      if (error) {
        console.error("1:1 메시지 전송 실패:", error);
        showNotice("메시지 전송에 실패했습니다.");
        return;
      }

      input.value = "";

      if (currentFriendId === friendId) {
        await renderMessages();
      }
    } catch (error) {
      console.error("1:1 채팅 처리 오류:", error);
      showNotice("채팅 처리 중 오류가 발생했습니다.");
    } finally {
      sending = false;
      if (button) button.disabled = false;
    }
  }

  async function refreshMessagePage() {
    await renderFriends();

    if (currentFriendId) {
      await renderMessages();
    }
  }

  function init() {
    const form = document.getElementById("dm-form");
    if (!form) return;
    
window.addEventListener("inhaGoOpenDirectChat", async event => {
  const friendId = event.detail?.friendId;
  if (!friendId) return;

  document.querySelector('[data-page="message"]')?.click();

  await renderFriends();
  await openRoom(friendId);
});


    form.addEventListener("submit", sendMessage);
    document.getElementById("dm-back")?.addEventListener("click", closeRoom);

    document.querySelectorAll('[data-page="message"]')
      .forEach(button => {
        button.addEventListener(
          "click",
          refreshMessagePage
        );
      });

    refreshMessagePage();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
