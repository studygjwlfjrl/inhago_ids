
/* InhaGo 1:1 쪽지 기능 - Supabase 연동 */

import { supabaseDev } from "./supabase-dev.js";

(() => {
  "use strict";

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

  function createMessageItem(message, received) {
    const item = document.createElement("div");
    item.className = "message-item";

    const name = document.createElement("strong");
    name.textContent = received
      ? `보낸 사람: ${message.sender_id}`
      : `받는 사람: ${message.receiver_id}`;

    const content = document.createElement("p");
    content.textContent = message.content;

    const time = document.createElement("small");
    time.className = "message-time";
    time.textContent = new Date(
      message.created_at
    ).toLocaleString("ko-KR");

    item.append(name, content, time);
    return item;
  }

  function renderMessageList(containerId, messages, received) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.replaceChildren();

    if (messages.length === 0) {
      const empty = document.createElement("p");
      empty.className = "message-empty";
      empty.textContent = "쪽지가 없습니다.";
      container.appendChild(empty);
      return;
    }

    messages.forEach(message => {
      container.appendChild(
        createMessageItem(message, received)
      );
    });
  }

  async function renderSupabaseMessages() {
    const { data: { user }, error: authError } =
      await supabaseDev.auth.getUser();

    if (authError || !user) {
      console.error("로그인 사용자 확인 실패:", authError);
      return;
    }

    const { data, error } = await supabaseDev
      .from("direct_messages")
      .select("*")
      .or(
        `sender_id.eq.${user.id},receiver_id.eq.${user.id}`
      )
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error("쪽지 조회 오류:", error);
      showNotice("쪽지를 불러오지 못했습니다.");
      return;
    }

    const messages = data ?? [];

    const received = messages.filter(
      message => message.receiver_id === user.id
    );

    const sent = messages.filter(
      message => message.sender_id === user.id
    );

    renderMessageList(
      "received-messages",
      received,
      true
    );

    renderMessageList(
      "sent-messages",
      sent,
      false
    );
  }

 
async function renderDevMessageRecipients() {
  const select = document.getElementById("message-recipient");
  if (!select) return;

  select.replaceChildren();

  const { data: { user }, error: authError } =
    await supabaseDev.auth.getUser();

  if (authError || !user) {
    console.error("로그인 사용자 확인 실패:", authError);
    return;
  }

  const { data, error } = await supabaseDev
    .from("friendships")
    .select("requester_id, receiver_id")
    .or(
      `requester_id.eq.${user.id},receiver_id.eq.${user.id}`
    )
    .eq("status", "accepted");

  if (error) {
    console.error("쪽지 친구 목록 조회 실패:", error);
    showNotice("친구 목록을 불러오지 못했습니다.");
    return;
  }

  const friends = new Set();

  (data ?? []).forEach(friendship => {
    const friendId =
      friendship.requester_id === user.id
        ? friendship.receiver_id
        : friendship.requester_id;

    if (friendId !== user.id) {
      friends.add(friendId);
    }
  });

  if (friends.size === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "쪽지를 보낼 친구가 없습니다.";
    select.appendChild(option);
    return;
  }

  friends.forEach(friendId => {
    const option = document.createElement("option");
    option.value = friendId;
    option.textContent = `친구 (${friendId.slice(0, 8)}...)`;
    select.appendChild(option);
  });
}


  async function sendSupabaseMessage(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const button = form.querySelector(
      'button[type="submit"]'
    );

    const select = document.getElementById("message-recipient");
    const textarea = document.getElementById("message-content");

    if (!select || !textarea) return;

    const receiverId = select.value;
    const content = textarea.value.trim();

    if (!receiverId || !content) {
      showNotice("받는 친구와 쪽지 내용을 확인해 주세요.");
      return;
    }

    if (button) button.disabled = true;

    try {
      const { data: { user }, error: authError } =
        await supabaseDev.auth.getUser();

      if (authError || !user) {
        showNotice("로그인이 필요합니다.");
        return;
      }

      if (receiverId === user.id) {
        showNotice("자기 자신에게는 쪽지를 보낼 수 없습니다.");
        return;
      }

      const { error } = await supabaseDev
        .from("direct_messages")
        .insert({
          sender_id: user.id,
          receiver_id: receiverId,
          content
        });

      if (error) {
        console.error("쪽지 전송 오류:", error);
        showNotice("쪽지 전송에 실패했습니다.");
        return;
      }

      textarea.value = "";
      showNotice("쪽지를 보냈습니다.");

      await renderSupabaseMessages();
    } catch (error) {
      console.error("쪽지 처리 오류:", error);
      showNotice("쪽지 처리 중 오류가 발생했습니다.");
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function refreshMessagePage() {
    await renderDevMessageRecipients();
    await renderSupabaseMessages();
  }

  function init() {
    const form = document.getElementById("message-form");
    if (!form) return;

    form.addEventListener("submit", sendSupabaseMessage);

    refreshMessagePage();

    document.querySelectorAll('[data-page="message"]')
      .forEach(button => {
        button.addEventListener("click", refreshMessagePage);
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
