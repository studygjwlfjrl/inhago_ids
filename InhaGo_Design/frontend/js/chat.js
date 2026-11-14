
/* InhaGo 모임별 채팅 기능 - Supabase + Realtime */

import { supabase as supabaseDev } from "./supabase.js";

(() => {
  "use strict";

  let currentRoomId = null;
  let currentUserId = null;
  let joinedMeetings = [];
  let refreshVersion = 0;
  let messageVersion = 0;

  // Realtime 관련 상태
  let realtimeChannel = null;
  let realtimeVersion = 0;

  const senderNames = new Map();
  async function appendNamedMessage(container, message) {
    if (!message?.id) return;
    if ([...container.querySelectorAll("[data-message-id]")].some(el => el.dataset.messageId === String(message.id))) return;
    container.querySelectorAll(".chat-empty").forEach(el => el.remove());
    const wrapper = document.createElement("div");
    wrapper.className = message.sender_id === currentUserId ? "chat-message mine" : "chat-message";
    wrapper.dataset.messageId = String(message.id);
    if (message.sender_id !== currentUserId) {
      const sender = document.createElement("strong");
      sender.className = "chat-sender-name";
      sender.textContent = senderNames.get(message.sender_id) || "이름 확인 중...";
      wrapper.append(sender);
      if (!senderNames.has(message.sender_id)) {
        const { data, error } = await supabaseDev.from("profiles").select("real_name").eq("id", message.sender_id).maybeSingle();
        if (error) console.warn("발신자 이름 조회 실패:", error.message);
        const name = data?.real_name?.split("/")[0]?.trim() || "이름 미등록";
        senderNames.set(message.sender_id, name);
        sender.textContent = name;
      }
    }
    const bubble = document.createElement("div");
    bubble.className = "chat-bubble";
    bubble.textContent = message.content;
    const time = document.createElement("small");
    time.textContent = formatTime(message.created_at);
    wrapper.append(bubble, time);
    container.appendChild(wrapper);
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
    empty.className = "chat-empty";
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
      console.error("채팅 로그인 확인 실패:", error);
      return null;
    }

    return data.user;
  }

  async function loadJoinedMeetings() {
    const user = await getCurrentUser();

    if (!user) {
      currentUserId = null;
      return [];
    }

    currentUserId = user.id;

    const { data: participationData, error: participationError } =
      await supabaseDev
        .from("meeting_participants")
        .select("meeting_id")
        .eq("user_id", user.id)
        .eq("status", "joined");

    if (participationError) {
      throw participationError;
    }

    const meetingIds = [
      ...new Set(
        (participationData ?? []).map(
          item => item.meeting_id
        )
      )
    ];

    const { data: createdMeetings, error: createdError } =
      await supabaseDev
        .from("meetings")
        .select("id, title, location_name, creator_id")
        .neq("status", "cancelled")
        .eq("creator_id", user.id);

    if (createdError) {
      throw createdError;
    }

    let participatingMeetings = [];

    if (meetingIds.length > 0) {
      const { data, error } = await supabaseDev
        .from("meetings")
        .select("id, title, location_name, creator_id")
        .in("id", meetingIds)
        .neq("status", "cancelled");

      if (error) {
        throw error;
      }

      participatingMeetings = data ?? [];
    }

    const meetingMap = new Map();

    [
      ...participatingMeetings,
      ...(createdMeetings ?? [])
    ].forEach(meeting => {
      meetingMap.set(meeting.id, meeting);
    });

    return [...meetingMap.values()];
  }

  async function renderRooms() {
    const container =
      document.getElementById("chat-room-list");

    if (!container) return;

    const version = ++refreshVersion;

    showEmpty(container, "채팅방을 불러오는 중입니다.");

    try {
      const meetings = await loadJoinedMeetings();

      if (version !== refreshVersion) return;

      joinedMeetings = meetings;
      if (currentRoomId && !meetings.some(m => String(m.id) === String(currentRoomId))) closeRoom();
      container.replaceChildren();

      if (meetings.length === 0) {
        showEmpty(
          container,
          "참여한 모임이 없습니다. 먼저 모임에 참여해 주세요."
        );
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
        place.textContent =
          `장소: ${meeting.location_name}`;

        info.append(title, place);

        const arrow = document.createElement("span");
        arrow.className = "chat-room-arrow";
        arrow.textContent = "›";
        item.setAttribute("role", "button");
        item.tabIndex = 0;
        item.setAttribute("aria-label", meeting.title + " 채팅방 열기");
        item.addEventListener("click", () => openRoom(meeting.id));
        item.addEventListener("keydown", event => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openRoom(meeting.id);
          }
        });
        item.append(info, arrow);
        container.appendChild(item);
      });
    } catch (error) {
      console.error("채팅방 조회 실패:", error);

      if (version !== refreshVersion) return;

      joinedMeetings = [];
      showEmpty(
        container,
        "채팅방을 불러오지 못했습니다."
      );
    }
  }

  // 기존 Realtime 구독 해제
  function unsubscribeRealtime() {
    realtimeVersion++;

    if (realtimeChannel) {
      supabaseDev.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }
  }

  // 새 채팅방 Realtime 구독
  function subscribeRealtime(roomId) {
    unsubscribeRealtime();

    const version = realtimeVersion;

    const channel = supabaseDev
      .channel(`chat-room-${roomId}-${version}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `meeting_id=eq.${roomId}`
        },
        payload => {
          if (
            version !== realtimeVersion ||
            currentRoomId !== roomId
          ) {
            return;
          }

          console.log(
            "실시간 채팅 메시지 수신:",
            payload.new
          );

          
const message = payload.new;
const container = document.getElementById("chat-messages");
if (!container) return;
appendNamedMessage(container, message).then(() => {
  container.scrollTop = container.scrollHeight;
});

   
}
      )
      .subscribe(status => {
        if (version !== realtimeVersion) return;

        console.log("채팅 Realtime 상태:", status);
        const indicator = document.getElementById("chat-realtime-status");
        if (indicator) indicator.textContent = status === "SUBSCRIBED" ? "실시간 채팅 연결됨" : status === "CHANNEL_ERROR" || status === "TIMED_OUT" ? "실시간 연결이 불안정합니다. 다시 입장해 주세요." : "실시간 채팅 연결 중...";

        if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT"
        ) {
          console.error(
            "채팅 실시간 연결에 문제가 발생했습니다."
          );
        }
      });

    realtimeChannel = channel;
  }

  function closeRoom() {
    unsubscribeRealtime();
    messageVersion++;
    currentRoomId = null;
    document.getElementById("chat-room")?.setAttribute("hidden", "");
    document.getElementById("chat-list-view")?.removeAttribute("hidden");
    const status = document.getElementById("chat-realtime-status");
    if (status) status.textContent = "채팅방을 선택해 주세요.";
  }

  async function openRoom(roomId) {
    const meeting = joinedMeetings.find(
      item => item.id === roomId
    );

    if (!meeting) {
      showNotice("참여한 모임만 입장할 수 있습니다.");
      return;
    }

   
  if (currentRoomId !== roomId) {
    // 다른 채팅방으로 이동할 때만 메시지 초기화
    messageVersion++;

    const messages =
     document.getElementById("chat-messages");

    if (messages) {
     messages.replaceChildren();
    }
  }

 currentRoomId = roomId;


    const room = document.getElementById("chat-room");
    const title =
      document.getElementById("chat-room-title");

    if (room) room.hidden = false;
    document.getElementById("chat-list-view")?.setAttribute("hidden", "");
    if (title) title.textContent = meeting.title;

    // 채팅방을 열면 Realtime 구독 시작
    subscribeRealtime(roomId);

    await renderMessages();
    window.dispatchEvent(new CustomEvent('inhaGoRoomRead', {detail:{type:'meeting',id:String(roomId)}}));
  }


  async function renderMessages() {
    const container =
      document.getElementById("chat-messages");

    if (!container || !currentRoomId) return;

    const roomId = currentRoomId;
    const version = ++messageVersion;

    const { data, error } = await supabaseDev
      .from("chat_messages")
      .select("id, meeting_id, sender_id, content, created_at")
      .eq("meeting_id", roomId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (
      roomId !== currentRoomId ||
      version !== messageVersion
    ) {
      return;
    }

    if (error) {
      console.error("채팅 메시지 조회 실패:", error);
      showEmpty(
        container,
        "메시지를 불러오지 못했습니다."
      );
      return;
    }

    const messages = (data ?? []).reverse();

    if (messages.length === 0) {
      if (!container.querySelector("[data-message-id]")) {
        showEmpty(container, "아직 메시지가 없습니다.");
      }
      return;
    }

    // 기존 메시지 ID 확인
    const existingMessages = new Set();

    container.querySelectorAll("[data-message-id]")
      .forEach(element => {
        existingMessages.add(element.dataset.messageId);
      });

    // 안내 문구만 제거
    container.querySelectorAll(".chat-empty")
      .forEach(element => element.remove());

    // 발신자 이름을 포함해 메시지 렌더링
    for (const message of messages) {
      if (roomId !== currentRoomId || version !== messageVersion) return;
      await appendNamedMessage(container, message);
    }

    // 채팅방에 처음 입장했을 때 맨 아래로 이동
    container.scrollTop = container.scrollHeight;
  }




  async function sendMessage(event) {
    event.preventDefault();

    if (!currentRoomId) {
      showNotice("채팅방을 먼저 선택해 주세요.");
      return;
    }

    const input = document.getElementById("chat-input");
    const button = event.currentTarget.querySelector(
      'button[type="submit"]'
    );

    if (!input) return;

    const content = input.value.trim();
    if (!content) return;

    const roomId = currentRoomId;

    if (button) button.disabled = true;

    try {
      const user = await getCurrentUser();

      if (!user) {
        showNotice("로그인이 필요합니다.");
        return;
      }

      const { error } = await supabaseDev
        .from("chat_messages")
        .insert({
          meeting_id: roomId,
          sender_id: user.id,
          content
        });

      if (error) {
        console.error("채팅 전송 실패:", error);
        showNotice("메시지 전송에 실패했습니다.");
        return;
      }

      input.value = "";
      showNotice("메시지를 보냈습니다.");

      
if (currentRoomId === roomId) {
  // Realtime 구독 여부와 무관하게 본인이 보낸 메시지는 즉시 조회합니다.
  await renderMessages();
}

    } catch (error) {
      console.error("채팅 처리 오류:", error);
      showNotice("채팅 처리 중 오류가 발생했습니다.");
    } finally {
      if (button) button.disabled = false;
    }
  }

  function init() {
    const form = document.getElementById("chat-form");
    if (!form) return;

    form.addEventListener("submit", sendMessage);
    document.getElementById("chat-back")?.addEventListener("click", closeRoom);

    document.querySelectorAll('[data-page="chat"]')
      .forEach(button => {
        button.addEventListener("click", () => {
          closeRoom();
          renderRooms();
        });
      });

    window.addEventListener("inhaGoMeetingsChanged", renderRooms);
    window.addEventListener("inhaGoLoginSuccess", renderRooms);
    renderRooms();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
