
/* =========================================
   InhaGo 모임 채팅 - 속도 개선 버전
   - 실시간 메시지 즉시 표시
   - 메시지 중복 방지
   - 발신자 이름 비동기 조회
   - 메시지 전송 후 전체 재조회 제거
   - 기존 모임 채팅 기능 유지
========================================= */

import { supabase as supabaseDev } from "./supabase.js";

(() => {
  "use strict";

  let currentRoomId = null;
  let currentUserId = null;
  let joinedMeetings = [];

  let refreshVersion = 0;
  let messageVersion = 0;
  let realtimeVersion = 0;

  let realtimeChannel = null;
  let sendingMessage = false;

  const senderNames = new Map();
  const pendingNames = new Map();
  const displayedIds = new Set();

  const $ = id => document.getElementById(id);

  // =====================================
  // 공통 함수
  // =====================================

  function showNotice(text) {
    const toast = $("toast");
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
    if (!container) return;

    container.replaceChildren();

    const empty = document.createElement("p");
    empty.className = "chat-empty";
    empty.textContent = text;

    container.appendChild(empty);
  }

  function formatTime(date) {
    if (!date) return "";

    const parsed = new Date(date);

    if (Number.isNaN(parsed.getTime())) {
      return "";
    }

    return parsed.toLocaleString("ko-KR");
  }

  async function getCurrentUser() {
    const { data, error } =
      await supabaseDev.auth.getUser();

    if (error || !data?.user) {
      console.error("채팅 로그인 확인 실패:", error);
      return null;
    }

    currentUserId = data.user.id;
    return data.user;
  }

  // =====================================
  // 발신자 이름 캐싱
  // =====================================

  async function getSenderName(senderId) {
    if (!senderId) return "이름 미등록";

    if (senderNames.has(senderId)) {
      return senderNames.get(senderId);
    }

    if (pendingNames.has(senderId)) {
      return pendingNames.get(senderId);
    }

    const request = (async () => {
      const { data, error } = await supabaseDev
        .from("profiles")
        .select("real_name")
        .eq("id", senderId)
        .maybeSingle();

      if (error) {
        console.warn(
          "발신자 이름 조회 실패:",
          error.message
        );
      }

      const name =
        data?.real_name?.split("/")[0]?.trim() ||
        "이름 미등록";

      senderNames.set(senderId, name);

      return name;
    })();

    pendingNames.set(senderId, request);

    try {
      return await request;
    } finally {
      pendingNames.delete(senderId);
    }
  }

  async function preloadSenderNames(messages) {
    const ids = [
      ...new Set(
        messages
          .map(message => message.sender_id)
          .filter(
            id =>
              id &&
              id !== currentUserId &&
              !senderNames.has(id)
          )
      )
    ];

    if (!ids.length) return;

    try {
      const { data, error } = await supabaseDev
        .from("profiles")
        .select("id, real_name")
        .in("id", ids);

      if (error) throw error;

      for (const profile of data || []) {
        senderNames.set(
          profile.id,
          profile.real_name?.split("/")[0]?.trim() ||
            "이름 미등록"
        );
      }
    } catch (error) {
      console.warn("발신자 이름 일괄 조회 실패:", error);
    }
  }

  // =====================================
  // 메시지 즉시 표시
  // =====================================

  function appendMessage(message, roomId = currentRoomId) {
    const container = $("chat-messages");

    if (!container || !message?.id) return;

    if (String(roomId) !== String(currentRoomId)) {
      return;
    }

    if (
      message.meeting_id != null &&
      String(message.meeting_id) !== String(roomId)
    ) {
      return;
    }

    const id = String(message.id);

    if (displayedIds.has(id)) return;

    displayedIds.add(id);

    container
      .querySelectorAll(".chat-empty")
      .forEach(el => el.remove());

    const mine = message.sender_id === currentUserId;

    const wrapper = document.createElement("div");

    wrapper.className = mine
      ? "chat-message mine"
      : "chat-message";

    wrapper.dataset.messageId = id;

    if (!mine) {
      const sender = document.createElement("strong");
      sender.className = "chat-sender-name";

      sender.textContent =
        senderNames.get(message.sender_id) ||
        "이름 확인 중...";

      wrapper.appendChild(sender);

      if (!senderNames.has(message.sender_id)) {
        getSenderName(message.sender_id)
          .then(name => {
            if (wrapper.isConnected) {
              sender.textContent = name;
            }
          })
          .catch(error => {
            console.warn("이름 표시 실패:", error);
          });
      }
    }

    const bubble = document.createElement("div");
    bubble.className = "chat-bubble";
    bubble.textContent = message.content || "";

    const time = document.createElement("small");
    time.textContent = formatTime(message.created_at);

    wrapper.append(bubble, time);
    container.appendChild(wrapper);

    container.scrollTop = container.scrollHeight;
  }

  // =====================================
  // 참여 중인 모임 조회
  // =====================================

  async function loadJoinedMeetings() {
    const user = await getCurrentUser();

    if (!user) {
      currentUserId = null;
      return [];
    }

    const [participationResult, createdResult] =
      await Promise.all([
        supabaseDev
          .from("meeting_participants")
          .select("meeting_id")
          .eq("user_id", user.id)
          .eq("status", "joined"),

        supabaseDev
          .from("meetings")
          .select(
            "id, title, location_name, creator_id"
          )
          .neq("status", "cancelled")
          .eq("creator_id", user.id)
      ]);

    if (participationResult.error) {
      throw participationResult.error;
    }

    if (createdResult.error) {
      throw createdResult.error;
    }

    const meetingIds = [
      ...new Set(
        (participationResult.data || [])
          .map(item => item.meeting_id)
          .filter(Boolean)
      )
    ];

    let participatingMeetings = [];

    if (meetingIds.length) {
      const { data, error } = await supabaseDev
        .from("meetings")
        .select(
          "id, title, location_name, creator_id"
        )
        .in("id", meetingIds)
        .neq("status", "cancelled");

      if (error) throw error;

      participatingMeetings = data || [];
    }

    const meetingMap = new Map();

    for (const meeting of [
      ...participatingMeetings,
      ...(createdResult.data || [])
    ]) {
      meetingMap.set(String(meeting.id), meeting);
    }

    return [...meetingMap.values()];
  }

  // =====================================
  // 모임 채팅방 목록
  // =====================================

  async function renderRooms() {
    const container = $("chat-room-list");

    if (!container) return;

    const version = ++refreshVersion;

    if (!container.children.length) {
      showEmpty(
        container,
        "채팅방을 불러오는 중입니다."
      );
    }

    try {
      const meetings = await loadJoinedMeetings();

      if (version !== refreshVersion) return;

      joinedMeetings = meetings;

      if (
        currentRoomId &&
        !meetings.some(
          meeting =>
            String(meeting.id) === String(currentRoomId)
        )
      ) {
        closeRoom();
      }

      if (!meetings.length) {
        showEmpty(
          container,
          "참여한 모임이 없습니다. 먼저 모임에 참여해 주세요."
        );
        return;
      }

      const fragment = document.createDocumentFragment();

      for (const meeting of meetings) {
        const item = document.createElement("div");
        item.className = "chat-room-item";

        const info = document.createElement("div");
        info.className = "chat-room-info";

        const title = document.createElement("strong");
        title.textContent = meeting.title;

        const place = document.createElement("small");
        place.textContent =
          `장소: ${meeting.location_name || "미정"}`;

        info.append(title, place);

        const arrow = document.createElement("span");
        arrow.className = "chat-room-arrow";
        arrow.textContent = "›";

        item.setAttribute("role", "button");
        item.tabIndex = 0;

        item.setAttribute(
          "aria-label",
          meeting.title + " 채팅방 열기"
        );

        item.addEventListener("click", () => {
          openRoom(meeting.id);
        });

        item.addEventListener("keydown", event => {
          if (
            event.key === "Enter" ||
            event.key === " "
          ) {
            event.preventDefault();
            openRoom(meeting.id);
          }
        });

        item.append(info, arrow);
        fragment.appendChild(item);
      }

      container.replaceChildren(fragment);

    } catch (error) {
      console.error("채팅방 조회 실패:", error);

      if (version === refreshVersion) {
        showEmpty(
          container,
          "채팅방을 불러오지 못했습니다."
        );
      }
    }
  }

  // =====================================
  // Realtime 구독 해제
  // =====================================

  function unsubscribeRealtime() {
    realtimeVersion++;

    if (realtimeChannel) {
      supabaseDev.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }
  }

  // =====================================
  // Realtime 연결
  // =====================================

  function subscribeRealtime(roomId) {
    unsubscribeRealtime();

    const version = realtimeVersion;

    realtimeChannel = supabaseDev
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
            String(currentRoomId) !== String(roomId)
          ) {
            return;
          }

          // 전체 메시지를 다시 조회하지 않는다.
          appendMessage(payload.new, roomId);
        }
      )
      .subscribe(status => {
        if (version !== realtimeVersion) return;

        const indicator = $("chat-realtime-status");

        if (indicator) {
          if (status === "SUBSCRIBED") {
            indicator.textContent =
              "실시간 채팅 연결됨";
          } else if (
            status === "CHANNEL_ERROR" ||
            status === "TIMED_OUT"
          ) {
            indicator.textContent =
              "실시간 연결이 불안정합니다. 다시 입장해 주세요.";
          } else {
            indicator.textContent =
              "실시간 채팅 연결 중...";
          }
        }

        if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT"
        ) {
          console.warn(
            "모임 채팅 Realtime 상태:",
            status
          );
        }
      });
  }

  // =====================================
  // 채팅방 닫기
  // =====================================

  function closeRoom() {
    unsubscribeRealtime();

    messageVersion++;
    currentRoomId = null;
    displayedIds.clear();

    $("chat-room")?.setAttribute("hidden", "");
    $("chat-list-view")?.removeAttribute("hidden");

    const status = $("chat-realtime-status");

    if (status) {
      status.textContent = "채팅방을 선택해 주세요.";
    }
  }

  // =====================================
  // 채팅방 열기
  // =====================================

  async function openRoom(roomId) {
    const meeting = joinedMeetings.find(
      item => String(item.id) === String(roomId)
    );

    if (!meeting) {
      showNotice("참여한 모임만 입장할 수 있습니다.");
      return;
    }

    const isNewRoom =
      String(currentRoomId) !== String(roomId);

    if (isNewRoom) {
      messageVersion++;
      displayedIds.clear();

      $("chat-messages")?.replaceChildren();
    }

    currentRoomId = roomId;

    const room = $("chat-room");
    const title = $("chat-room-title");

    if (room) room.hidden = false;

    $("chat-list-view")?.setAttribute("hidden", "");

    if (title) {
      title.textContent = meeting.title;
    }

    // 다른 방으로 이동할 때만 새로 구독한다.
    if (isNewRoom || !realtimeChannel) {
      subscribeRealtime(roomId);
      await renderMessages();
    }

    window.dispatchEvent(
      new CustomEvent("inhaGoRoomRead", {
        detail: {
          type: "meeting",
          id: String(roomId)
        }
      })
    );
  }

  // =====================================
  // 기존 메시지 불러오기
  // =====================================

  async function renderMessages() {
    const container = $("chat-messages");

    if (!container || !currentRoomId) return;

    const roomId = currentRoomId;
    const version = ++messageVersion;

    try {
      const { data, error } = await supabaseDev
        .from("chat_messages")
        .select(
          "id, meeting_id, sender_id, content, created_at"
        )
        .eq("meeting_id", roomId)
        .order("created_at", {
          ascending: false
        })
        .limit(100);

      if (error) throw error;

      if (
        String(roomId) !== String(currentRoomId) ||
        version !== messageVersion
      ) {
        return;
      }

      const messages = [...(data || [])].reverse();

      // 이름 조회는 메시지 표시를 막지 않는다.
      preloadSenderNames(messages).catch(console.error);

      if (!messages.length) {
        if (!displayedIds.size) {
          showEmpty(container, "아직 메시지가 없습니다.");
        }
        return;
      }

      for (const message of messages) {
        if (
          String(roomId) !== String(currentRoomId) ||
          version !== messageVersion
        ) {
          return;
        }

        appendMessage(message, roomId);
      }

      container.scrollTop = container.scrollHeight;

    } catch (error) {
      console.error("채팅 메시지 조회 실패:", error);

      if (
        String(roomId) === String(currentRoomId) &&
        version === messageVersion &&
        !displayedIds.size
      ) {
        showEmpty(
          container,
          "메시지를 불러오지 못했습니다."
        );
      }
    }
  }

  // =====================================
  // 메시지 전송
  // =====================================

  async function sendMessage(event) {
    event.preventDefault();

    if (sendingMessage) return;

    if (!currentRoomId) {
      showNotice("채팅방을 먼저 선택해 주세요.");
      return;
    }

    const input = $("chat-input");

    const button = event.currentTarget.querySelector(
      'button[type="submit"]'
    );

    if (!input) return;

    const content = input.value.trim();

    if (!content) return;

    const roomId = currentRoomId;

    sendingMessage = true;

    if (button) button.disabled = true;

    try {
      const user = await getCurrentUser();

      if (!user) {
        showNotice("로그인이 필요합니다.");
        return;
      }

      const { data, error } = await supabaseDev
        .from("chat_messages")
        .insert({
          meeting_id: roomId,
          sender_id: user.id,
          content
        })
        .select(
          "id, meeting_id, sender_id, content, created_at"
        )
        .single();

      if (error) throw error;

      // 저장 성공 직후 화면에 즉시 표시
      if (String(currentRoomId) === String(roomId)) {
        if (data) appendMessage(data, roomId);

        if (input.value.trim() === content) {
          input.value = "";
        }
      }

    } catch (error) {
      console.error("채팅 전송 실패:", error);
      showNotice(
        "메시지 전송에 실패했습니다."
      );
    } finally {
      sendingMessage = false;

      if (button) button.disabled = false;
    }
  }

  // =====================================
  // 초기화
  // =====================================

  function init() {
    const form = $("chat-form");

    if (!form) return;

    form.addEventListener("submit", sendMessage);

    $("chat-back")?.addEventListener(
      "click",
      closeRoom
    );

    document
      .querySelectorAll('[data-page="chat"]')
      .forEach(button => {
        button.addEventListener("click", () => {
          closeRoom();
          renderRooms();
        });
      });

    window.addEventListener(
      "inhaGoMeetingsChanged",
      renderRooms
    );

    window.addEventListener(
      "inhaGoLoginSuccess",
      renderRooms
    );

    renderRooms();
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      init
    );
  } else {
    init();
  }

  // =====================================
  // 페이지 종료 시 연결 정리
  // =====================================

  window.addEventListener("pagehide", () => {
    unsubscribeRealtime();
  });

})();
