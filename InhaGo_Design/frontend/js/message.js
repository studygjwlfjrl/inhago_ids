
/* =========================================
   InhaGo 1:1 실시간 채팅
   Supabase 연동 - 속도 개선 버전

   주요 기능
   1. 친구 이름 일괄 조회
   2. 마지막 메시지 미리보기
   3. 최근 대화순 정렬
   4. 실시간 메시지 즉시 표시
   5. 메시지 중복 표시 방지
   6. 통합 채팅 탭 호환
========================================= */

import { supabase as supabaseDev } from "./supabase.js";

(() => {
  "use strict";

  let currentUserId = null;
  let currentFriendId = null;
  let currentFriendName = "";

  let realtimeChannel = null;
  let listRealtimeChannel = null;

  let realtimeVersion = 0;
  let messageVersion = 0;
  let friendVersion = 0;

  let sending = false;

  const friendNames = new Map();
  const knownFriends = new Set();
  const lastMessages = new Map();

  const displayedMessageIds = new Set();

  /* =========================================
     1. DOM 요소
  ========================================= */

  const getElement = id =>
    document.getElementById(id);

  const getFriendList = () =>
    getElement("dm-friend-list");

  const getMessageList = () =>
    getElement("dm-messages");

  const getListView = () =>
    getElement("dm-list-view");

  const getRoomView = () =>
    getElement("dm-room");

  const getRoomTitle = () =>
    getElement("dm-room-title");

  /* =========================================
     2. 공통 함수
  ========================================= */

  function showNotice(text) {
    const toast = getElement("toast");

    if (!toast) {
      console.warn(text);
      return;
    }

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
    empty.className = "message-empty";
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

  function formatPreviewTime(date) {
    if (!date) return "";

    const parsed = new Date(date);

    if (Number.isNaN(parsed.getTime())) {
      return "";
    }

    const today = new Date();

    if (
      parsed.toDateString() ===
      today.toDateString()
    ) {
      return parsed.toLocaleTimeString("ko-KR", {
        hour: "numeric",
        minute: "2-digit"
      });
    }

    return parsed.toLocaleDateString("ko-KR", {
      month: "numeric",
      day: "numeric"
    });
  }

  function getDisplayName(profile) {
    const realName = profile?.real_name;

    if (realName) {
      return realName.split("/")[0].trim();
    }

    return profile?.nickname || "이름 미등록";
  }

  async function getCurrentUser() {
    const { data, error } =
      await supabaseDev.auth.getUser();

    if (error || !data?.user) {
      return null;
    }

    return data.user;
  }

  async function getRealUserName(userId) {
    if (friendNames.has(userId)) {
      return friendNames.get(userId);
    }

    const { data, error } = await supabaseDev
      .from("profiles")
      .select("real_name, nickname")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      console.error(
        "사용자 이름 조회 실패:",
        error
      );

      return "이름 조회 실패";
    }

    const name = getDisplayName(data);

    friendNames.set(userId, name);

    return name;
  }

  /* =========================================
     3. 친구 목록 조회
  ========================================= */

  async function loadFriends(userId) {
    if (!userId) return [];

    const { data, error } = await supabaseDev
      .from("friendships")
      .select("requester_id, receiver_id")
      .or(
        `requester_id.eq.${userId},receiver_id.eq.${userId}`
      )
      .eq("status", "accepted");

    if (error) throw error;

    const friends = new Set();

    for (const friendship of data || []) {
      const friendId =
        friendship.requester_id === userId
          ? friendship.receiver_id
          : friendship.requester_id;

      if (friendId && friendId !== userId) {
        friends.add(friendId);
      }
    }

    return [...friends];
  }

  /* =========================================
     4. 친구 이름 일괄 조회

     기존:
     친구마다 profiles 조회

     변경:
     profiles 한 번 조회
  ========================================= */

  async function loadFriendNames(friendIds) {
    if (friendIds.length === 0) return;

    const missingIds = friendIds.filter(
      id => !friendNames.has(id)
    );

    if (missingIds.length === 0) return;

    const { data, error } = await supabaseDev
      .from("profiles")
      .select("id, real_name, nickname")
      .in("id", missingIds);

    if (error) {
      console.error(
        "친구 이름 일괄 조회 실패:",
        error
      );

      for (const id of missingIds) {
        friendNames.set(id, "이름 조회 실패");
      }

      return;
    }

    const profileMap = new Map(
      (data || []).map(profile => [
        profile.id,
        profile
      ])
    );

    for (const id of missingIds) {
      const profile = profileMap.get(id);

      friendNames.set(
        id,
        getDisplayName(profile)
      );
    }
  }

  /* =========================================
     5. 마지막 메시지 조회
  ========================================= */

  async function loadDirectChatPreviews(userId) {
    const previews = new Map();

    if (!userId) return previews;

    const { data, error } = await supabaseDev
      .from("direct_messages")
      .select(
        "id, sender_id, receiver_id, content, created_at"
      )
      .or(
        `sender_id.eq.${userId},receiver_id.eq.${userId}`
      )
      .order("created_at", {
        ascending: false
      })
      .limit(500);

    if (error) throw error;

    for (const message of data || []) {
      const friendId =
        message.sender_id === userId
          ? message.receiver_id
          : message.sender_id;

      if (!previews.has(friendId)) {
        previews.set(friendId, message);
      }
    }

    return previews;
  }

  /* =========================================
     6. 친구 채팅 목록 UI
  ========================================= */

  function createFriendRow(friendId) {
    const item = document.createElement("div");

    item.className = "message-item dm-chat-row";
    item.dataset.friendId = friendId;

    const info = document.createElement("div");
    info.className = "dm-chat-info";

    const name = document.createElement("strong");
    name.className = "dm-friend-name";

    name.textContent =
      friendNames.get(friendId) ||
      "이름 미등록";

    const preview = document.createElement("p");
    preview.className = "dm-last-preview";

    const time = document.createElement("small");
    time.className = "dm-last-time";

    info.append(name, preview);
    item.append(info, time);

    updateFriendRow(item, friendId);

    item.addEventListener("click", () => {
      openRoom(friendId);
    });

    return item;
  }

  function updateFriendRow(item, friendId) {
    const lastMessage = lastMessages.get(friendId);

    const preview = item.querySelector(
      ".dm-last-preview"
    );

    const time = item.querySelector(
      ".dm-last-time"
    );

    const name = item.querySelector(
      ".dm-friend-name"
    );

    if (name) {
      name.textContent =
        friendNames.get(friendId) ||
        "이름 미등록";
    }

    if (preview) {
      preview.textContent = lastMessage
        ? (
            lastMessage.sender_id === currentUserId
              ? "나: "
              : ""
          ) + lastMessage.content
        : "아직 나눈 대화가 없습니다.";
    }

    if (time) {
      time.textContent = lastMessage
        ? formatPreviewTime(lastMessage.created_at)
        : "";
    }
  }

  function sortFriendRows() {
    const container = getFriendList();

    if (!container) return;

    const rows = [
      ...container.querySelectorAll(
        ".dm-chat-row[data-friend-id]"
      )
    ];

    rows.sort((a, b) => {
      const messageA = lastMessages.get(
        a.dataset.friendId
      );

      const messageB = lastMessages.get(
        b.dataset.friendId
      );

      const timeA =
        messageA?.created_at || "";

      const timeB =
        messageB?.created_at || "";

      return timeB.localeCompare(timeA);
    });

    for (const row of rows) {
      container.appendChild(row);
    }
  }

  function updateLastMessage(message) {
    if (!message || !currentUserId) return;

    const friendId =
      message.sender_id === currentUserId
        ? message.receiver_id
        : message.sender_id;

    if (!knownFriends.has(friendId)) return;

    const previous = lastMessages.get(friendId);

    if (
      previous &&
      new Date(previous.created_at).getTime() >
        new Date(message.created_at).getTime()
    ) {
      return;
    }

    lastMessages.set(friendId, message);

    const container = getFriendList();

    if (!container) return;

    const row = [
      ...container.querySelectorAll(
        ".dm-chat-row[data-friend-id]"
      )
    ].find(
      element =>
        element.dataset.friendId === friendId
    );

    if (row) {
      updateFriendRow(row, friendId);
      sortFriendRows();
    }
  }

  /* =========================================
     7. 친구 채팅 목록 렌더링
  ========================================= */

  async function renderFriends(options = {}) {
    const container = getFriendList();

    if (!container) return;

    const version = ++friendVersion;

    if (!options.silent) {
      showEmpty(
        container,
        "친구 목록을 불러오는 중..."
      );
    }

    try {
      const user = await getCurrentUser();

      if (version !== friendVersion) return;

      if (!user) {
        currentUserId = null;
        knownFriends.clear();
        lastMessages.clear();

        showEmpty(
          container,
          "로그인 후 이용할 수 있습니다."
        );

        return;
      }

      const userId = user.id;

      if (
        currentUserId &&
        currentUserId !== userId
      ) {
        closeRoom();
        friendNames.clear();
        lastMessages.clear();
      }

      currentUserId = userId;

      const [friends, previews] =
        await Promise.all([
          loadFriends(userId),
          loadDirectChatPreviews(userId)
        ]);

      if (version !== friendVersion) return;

      await loadFriendNames(friends);

      if (version !== friendVersion) return;

      knownFriends.clear();

      for (const friendId of friends) {
        knownFriends.add(friendId);
      }

      for (const friendId of [
        ...lastMessages.keys()
      ]) {
        if (!knownFriends.has(friendId)) {
          lastMessages.delete(friendId);
        }
      }

      for (const friendId of friends) {
        const serverMessage = previews.get(friendId);
        const existingMessage = lastMessages.get(friendId);

        if (!serverMessage) continue;

        if (
          !existingMessage ||
          new Date(serverMessage.created_at).getTime() >=
            new Date(existingMessage.created_at).getTime()
        ) {
          lastMessages.set(
            friendId,
            serverMessage
          );
        }
      }

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

      friends.sort((a, b) => {
        const timeA =
          lastMessages.get(a)?.created_at || "";

        const timeB =
          lastMessages.get(b)?.created_at || "";

        return timeB.localeCompare(timeA);
      });

      const fragment =
        document.createDocumentFragment();

      for (const friendId of friends) {
        fragment.appendChild(
          createFriendRow(friendId)
        );
      }

      container.replaceChildren(fragment);

    } catch (error) {
      console.error(
        "친구 채팅 목록 조회 실패:",
        error
      );

      if (version !== friendVersion) return;

      if (!options.silent) {
        showEmpty(
          container,
          "친구 목록을 불러오지 못했습니다."
        );
      }
    }
  }

  /* =========================================
     8. 메시지 UI 생성
  ========================================= */

  function appendMessage(container, message) {
    if (!container || !message) return;

    const messageId = String(message.id);

    if (displayedMessageIds.has(messageId)) {
      return;
    }

    const wrapper = document.createElement("div");

    const isMine =
      message.sender_id === currentUserId;

    wrapper.className = isMine
      ? "chat-message mine"
      : "chat-message";

    wrapper.dataset.messageId = messageId;

    if (!isMine) {
      const sender = document.createElement("strong");

      sender.className = "dm-sender-name";
      sender.textContent =
        currentFriendName || "상대방";

      wrapper.appendChild(sender);
    }

    const bubble = document.createElement("div");
    bubble.className = "chat-bubble";
    bubble.textContent = message.content;

    const time = document.createElement("small");
    time.textContent = formatTime(
      message.created_at
    );

    wrapper.append(bubble, time);
    container.appendChild(wrapper);

    displayedMessageIds.add(messageId);

    container.scrollTop =
      container.scrollHeight;
  }

  /* =========================================
     9. 메시지 조회
  ========================================= */

  async function renderMessages() {
    const container = getMessageList();

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

    try {
      const { data, error } = await supabaseDev
        .from("direct_messages")
        .select(
          "id, sender_id, receiver_id, content, created_at"
        )
        .or(
          `and(sender_id.eq.${userId},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${userId})`
        )
        .order("created_at", {
          ascending: false
        })
        .limit(100);

      if (
        version !== messageVersion ||
        userId !== currentUserId ||
        friendId !== currentFriendId
      ) {
        return;
      }

      if (error) throw error;

      const messages = [...(data || [])].reverse();

      if (messages.length === 0) {
        if (displayedMessageIds.size === 0) {
          showEmpty(
            container,
            "아직 메시지가 없습니다."
          );
        }

        return;
      }

      container.querySelectorAll(".message-empty")
        .forEach(element => element.remove());

      // 처음 불러올 때는 전체 기록 표시
      if (displayedMessageIds.size === 0) {
        container.replaceChildren();

        for (const message of messages) {
          appendMessage(container, message);
        }
      } else {
        // 기존 메시지는 유지하고 누락된 메시지만 추가
        for (const message of messages) {
          if (!displayedMessageIds.has(
            String(message.id)
          )) {
            appendMessage(container, message);
          }
        }
      }

      const latest = messages[messages.length - 1];

      if (latest) {
        updateLastMessage(latest);
      }

      container.scrollTop =
        container.scrollHeight;

    } catch (error) {
      console.error(
        "1:1 메시지 조회 실패:",
        error
      );

      if (
        version === messageVersion &&
        friendId === currentFriendId &&
        displayedMessageIds.size === 0
      ) {
        showEmpty(
          container,
          "메시지를 불러오지 못했습니다."
        );
      }
    }
  }

  /* =========================================
     10. 실시간 메시지 처리
  ========================================= */

  function handleRealtimeMessage(message) {
    if (!message || !currentUserId) return;

    const isRelated =
      message.sender_id === currentUserId ||
      message.receiver_id === currentUserId;

    if (!isRelated) return;

    const friendId =
      message.sender_id === currentUserId
        ? message.receiver_id
        : message.sender_id;

    if (!knownFriends.has(friendId)) return;

    // 채팅 목록은 즉시 갱신
    updateLastMessage(message);

    // 현재 열린 채팅방이면 메시지도 즉시 표시
    if (currentFriendId === friendId) {
      const container = getMessageList();

      if (container) {
        container.querySelectorAll(".message-empty")
          .forEach(element => element.remove());

        appendMessage(container, message);
      }
    }
  }

  /* =========================================
     11. 실시간 구독 관리
  ========================================= */

  function unsubscribeRealtime() {
    realtimeVersion++;

    if (realtimeChannel) {
      const oldChannel = realtimeChannel;
      realtimeChannel = null;

      supabaseDev.removeChannel(oldChannel);
    }
  }

  function unsubscribeListRealtime() {
    if (listRealtimeChannel) {
      const oldChannel = listRealtimeChannel;
      listRealtimeChannel = null;

      supabaseDev.removeChannel(oldChannel);
    }
  }

  function subscribeRealtime(friendId) {
    unsubscribeRealtime();

    if (!currentUserId || !friendId) return;

    const version = realtimeVersion;
    const userId = currentUserId;

    const channel = supabaseDev
      .channel(
        `dm-room-${userId}-${friendId}-${version}`
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
            currentFriendId !== friendId ||
            currentUserId !== userId
          ) {
            return;
          }

          const message = payload.new;

          const belongsToRoom =
            (
              message.sender_id === userId &&
              message.receiver_id === friendId
            ) ||
            (
              message.sender_id === friendId &&
              message.receiver_id === userId
            );

          if (belongsToRoom) {
            handleRealtimeMessage(message);
          }
        }
      )
      .subscribe(status => {
        if (version !== realtimeVersion) return;

        console.log(
          "1:1 채팅 실시간 상태:",
          status
        );

        if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT"
        ) {
          console.warn(
            "1:1 실시간 연결 문제:",
            status
          );
        }
      });

    realtimeChannel = channel;
  }

  /* =========================================
     12. 친구 채팅 목록 실시간 구독

     다른 친구에게서 메시지가 도착해도
     목록의 마지막 메시지가 갱신된다.
  ========================================= */

  function subscribeListRealtime() {
    unsubscribeListRealtime();

    if (!currentUserId) return;

    const userId = currentUserId;

    listRealtimeChannel = supabaseDev
      .channel(`dm-list-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "direct_messages",
          filter: `receiver_id=eq.${userId}`
        },
        payload => {
          if (currentUserId !== userId) return;

          handleRealtimeMessage(payload.new);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "direct_messages",
          filter: `sender_id=eq.${userId}`
        },
        payload => {
          if (currentUserId !== userId) return;

          handleRealtimeMessage(payload.new);
        }
      )
      .subscribe(status => {
        console.log(
          "1:1 목록 실시간 상태:",
          status
        );
      });
  }

  /* =========================================
     13. 채팅방 닫기
  ========================================= */

  function closeRoom() {
    unsubscribeRealtime();

    messageVersion++;

    currentFriendId = null;
    currentFriendName = "";

    displayedMessageIds.clear();

    const listView = getListView();
    const roomView = getRoomView();
    const messages = getMessageList();

    if (listView) listView.hidden = false;
    if (roomView) roomView.hidden = true;

    if (messages) {
      messages.replaceChildren();
    }

    sortFriendRows();
  }

  /* =========================================
     14. 채팅방 열기
  ========================================= */

  async function openRoom(friendId) {
    if (!knownFriends.has(friendId)) {
      showNotice(
        "수락된 친구만 채팅할 수 있습니다."
      );
      return;
    }

    const user = await getCurrentUser();

    if (!user) {
      showNotice("로그인이 필요합니다.");
      return;
    }

    currentUserId = user.id;

    // 기존 채팅방 구독 정리
    unsubscribeRealtime();

    currentFriendId = friendId;
    currentFriendName =
      friendNames.get(friendId) ||
      "상대방";

    displayedMessageIds.clear();
    messageVersion++;

    const listView = getListView();
    const roomView = getRoomView();
    const title = getRoomTitle();
    const messages = getMessageList();

    if (listView) listView.hidden = true;
    if (roomView) roomView.hidden = false;

    if (title) {
      title.textContent = currentFriendName;
    }

    if (messages) {
      showEmpty(
        messages,
        "메시지를 불러오는 중..."
      );
    }

    subscribeRealtime(friendId);

    // 이름은 이미 목록에서 조회했으므로
    // 추가 네트워크 요청 없이 바로 표시
    await renderMessages();
  }

  /* =========================================
     15. 메시지 전송
  ========================================= */

  async function sendMessage(event) {
    event.preventDefault();

    if (sending) return;

    const form = event.currentTarget;
    const input = getElement("dm-input");

    const button = form.querySelector(
      'button[type="submit"]'
    );

    if (!input) return;

    const content = input.value.trim();
    const friendId = currentFriendId;

    if (!friendId || !content) {
      showNotice(
        "채팅방과 메시지를 확인해 주세요."
      );
      return;
    }

    if (!knownFriends.has(friendId)) {
      showNotice(
        "수락된 친구만 채팅할 수 있습니다."
      );
      return;
    }

    sending = true;

    if (button) {
      button.disabled = true;
    }

    try {
      const userId = currentUserId;

      if (!userId) {
        showNotice("로그인이 필요합니다.");
        return;
      }

      const { data, error } = await supabaseDev
        .from("direct_messages")
        .insert({
          sender_id: userId,
          receiver_id: friendId,
          content
        })
        .select(
          "id, sender_id, receiver_id, content, created_at"
        )
        .single();

      if (error) throw error;

      // 성공한 메시지는 서버에서 다시 조회하지 않고
      // 반환된 데이터로 즉시 표시
      if (data) {
        handleRealtimeMessage(data);
      }

      // 사용자가 전송 중 다른 방으로 이동했을 때
      // 새 채팅방의 입력 내용을 지우지 않음
      if (currentFriendId === friendId) {
        if (input.value.trim() === content) {
          input.value = "";
        }
      }

    } catch (error) {
      console.error(
        "1:1 메시지 전송 실패:",
        error
      );

      showNotice(
        "메시지 전송에 실패했습니다."
      );

    } finally {
      sending = false;

      if (button) {
        button.disabled = false;
      }
    }
  }

  /* =========================================
     16. 채팅 페이지 새로고침
  ========================================= */

  async function refreshMessagePage() {
    await renderFriends({
      silent: true
    });

    if (currentFriendId) {
      await renderMessages();
    }
  }

  /* =========================================
     17. 통합 채팅 페이지 이동
  ========================================= */

  function showDirectChatPage() {
    const chatPage = getElement("chat-page");
    const messagePage = getElement("message-page");

    if (!chatPage) return;

    document.querySelectorAll(".page")
      .forEach(page => {
        page.classList.remove("active");
      });

    chatPage.classList.add("active");

    if (messagePage) {
      messagePage.classList.remove("active");
      messagePage.hidden = true;
    }

    const meetingView =
      getElement("meeting-chat-view");

    const groupView =
      getElement("group-chat-view");

    const directView =
      getElement("direct-chat-view");

    if (meetingView) meetingView.hidden = true;
    if (groupView) groupView.hidden = true;
    if (directView) directView.hidden = false;

    const meetingTab =
      getElement("meeting-chat-tab");

    const groupTab =
      getElement("group-chat-tab");

    const directTab =
      getElement("direct-chat-tab");

    meetingTab?.classList.remove("active");
    groupTab?.classList.remove("active");
    directTab?.classList.add("active");

    meetingTab?.setAttribute(
      "aria-selected",
      "false"
    );

    groupTab?.setAttribute(
      "aria-selected",
      "false"
    );

    directTab?.setAttribute(
      "aria-selected",
      "true"
    );
  }

  /* =========================================
     18. 친구 페이지에서 1:1 채팅 열기
  ========================================= */

  async function openDirectChatFromFriend(event) {
    const friendId = event.detail?.friendId;

    if (!friendId) return;

    showDirectChatPage();

    // 친구 목록을 갱신한 뒤 채팅방 입장
    await renderFriends({
      silent: true
    });

    if (!knownFriends.has(friendId)) {
      showNotice(
        "친구 관계를 확인할 수 없습니다."
      );
      return;
    }

    await openRoom(friendId);
  }

  /* =========================================
     19. 초기화
  ========================================= */

  async function initializeDirectChat() {
    const form = getElement("dm-form");

    if (!form) return;

    form.addEventListener(
      "submit",
      sendMessage
    );

    getElement("dm-back")?.addEventListener(
      "click",
      () => {
        closeRoom();
        renderFriends({ silent: true });
      }
    );

    getElement("direct-chat-tab")
      ?.addEventListener("click", () => {
        refreshMessagePage();
      });

    document.querySelectorAll(
      '[data-page="message"]'
    ).forEach(button => {
      button.addEventListener(
        "click",
        refreshMessagePage
      );
    });

    window.addEventListener(
      "inhaGoOpenDirectChat",
      openDirectChatFromFriend
    );

    await renderFriends();

    if (currentUserId) {
      subscribeListRealtime();
    }
  }

  /* =========================================
     20. 로그인 변경 감지
  ========================================= */

  supabaseDev.auth.onAuthStateChange(
    (event, session) => {
      if (
        event !== "SIGNED_IN" &&
        event !== "SIGNED_OUT"
      ) {
        return;
      }

      const newUserId =
        session?.user?.id || null;

      if (newUserId === currentUserId) {
        return;
      }

      closeRoom();
      unsubscribeListRealtime();

      currentUserId = newUserId;

      friendNames.clear();
      knownFriends.clear();
      lastMessages.clear();

      // 인증 이벤트 처리 중 추가 인증 호출을
      // 바로 실행하지 않도록 다음 작업으로 넘김
      setTimeout(async () => {
        await renderFriends();

        if (currentUserId) {
          subscribeListRealtime();
        }
      }, 0);
    }
  );

  /* =========================================
     21. 페이지 종료 시 정리
  ========================================= */

  window.addEventListener(
    "pagehide",
    () => {
      unsubscribeRealtime();
      unsubscribeListRealtime();
    }
  );

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      initializeDirectChat
    );
  } else {
    initializeDirectChat();
  }

})();
