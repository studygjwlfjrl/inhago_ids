
import { supabase as supabaseDev } from "./supabase.js";

(() => {
  "use strict";

  async function checkSupabaseConnection() {
    const { data: { user }, error } =
      await supabaseDev.auth.getUser();

    if (error) {
      console.error("Supabase 인증 확인 오류:", error.message);
      return;
    }

    if (user) {
      console.log("친구 관리 Supabase 연결 성공!");
      console.log("현재 사용자 ID:", user.id);
    } else {
      console.log("Supabase 연결됨 - 로그인이 필요합니다.");
    }
  }

  checkSupabaseConnection();

  // Supabase에서 실제 친구 목록 조회
  async function loadSupabaseFriends() {
    const { data: { user }, error: authError } =
      await supabaseDev.auth.getUser();

    if (authError || !user) {
      console.log("친구 목록 조회: 로그인 필요");
      return;
    }

    const { data, error } = await supabaseDev
      .from("friendships")
      .select("id, requester_id, receiver_id, status")
      .or(
        `requester_id.eq.${user.id},receiver_id.eq.${user.id}`
      )
      .eq("status", "accepted");

    if (error) {
      console.error("친구 목록 조회 실패:", error.message);
      return;
    }

    console.log("Supabase 친구 목록:", data);
    console.log("친구 수:", data.length);

    return data;
  }

  loadSupabaseFriends();

  const STORAGE_KEY = "inhago_friends_demo_v1";

  const sampleUsers = [
    { id: "u1", name: "김인하", department: "학과 미설정" },
    { id: "u2", name: "박지민", department: "학과 미설정" },
    { id: "u3", name: "이수연", department: "학과 미설정" },
    { id: "u4", name: "최민준", department: "학과 미설정" }
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

    const department = document.createElement("small");
    department.textContent = `학과: ${user.department || "학과 미설정"}`;

    info.append(name, department);

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
    
if (action === "open-direct-chat") {
  window.dispatchEvent(
    new CustomEvent("inhaGoOpenDirectChat", {
      detail: { friendId: userId }
    })
  );
  return;
}


      // Supabase 친구 요청
     if (action === "request-supabase") {
      sendSupabaseFriendRequest(userId);
      return;
     }


    if (action === "remove-supabase") {
      const friendship = supabaseFriendships.find(item =>
        item.requester_id === userId ||
        item.receiver_id === userId
      );

      if (!friendship) {
        notify("친구 관계를 찾을 수 없습니다.");
        return;
      }

      removeSupabaseFriend(friendship.id);
      return;
    }

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

  async function getRealUserName(userId) {
    const { data, error } = await supabaseDev
      .from("profiles")
      .select("real_name")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      console.error("사용자 이름 조회 실패:", error.message);
      return "이름 조회 실패";
    }

    return data?.real_name
      ? data.real_name.split("/")[0].trim()
      : "이름 미등록";
  }

  async function getUserDepartment(userId) {
    const { data, error } = await supabaseDev.from("profiles")
      .select("department").eq("id", userId).maybeSingle();
    if (error) {
      if (!/department|column|schema cache/i.test(error.message)) console.warn("학과 조회 실패:", error.message);
      return "학과 미설정";
    }
    return data?.department?.trim() || "학과 미설정";
  }

  // 개발용 계정 표시명
  function getDevUserName(userId) {
    const names = {
      "693e8c4a-4774-4ae8-9aef-0d82d28f4b8e": "테스트 사용자 A",
      "037d8d7a-58f0-4d1b-beff-5ef7b956f3bf": "테스트 사용자 B"
    };

    return names[userId] || "사용자";
  }

  // Supabase 친구 요청 거절
  async function rejectSupabaseFriendRequest(friendshipId) {
    const { data: { user }, error: authError } =
      await supabaseDev.auth.getUser();

    if (authError || !user) {
      notify("로그인이 필요합니다.");
      return;
    }

    const { data, error } = await supabaseDev
      .from("friendships")
      .update({ status: "rejected" })
      .eq("id", friendshipId)
      .eq("receiver_id", user.id)
      .eq("status", "pending")
      .select("id, status");

    if (error) {
      console.error("친구 요청 거절 실패:", error.message);
      notify("친구 요청 거절에 실패했습니다.");
      return;
    }

    if (!data || data.length === 0) {
      notify("거절할 친구 요청이 없습니다.");
      return;
    }

    console.log("친구 요청 거절 성공:", data);
    notify("친구 요청을 거절했습니다.");

    await renderSupabaseReceivedRequests();
  }

  // Supabase 친구 요청 수락
  async function acceptSupabaseFriendRequest(friendshipId) {
    const { data: { user }, error: authError } =
      await supabaseDev.auth.getUser();

    if (authError || !user) {
      notify("로그인이 필요합니다.");
      return;
    }

    const { data, error } = await supabaseDev
      .from("friendships")
      .update({ status: "accepted" })
      .eq("id", friendshipId)
      .eq("receiver_id", user.id)
      .eq("status", "pending")
      .select("id, status");

    if (error) {
      console.error("친구 요청 수락 실패:", error.message);
      notify("친구 요청 수락에 실패했습니다.");
      return;
    }

    if (!data || data.length === 0) {
      notify("수락할 친구 요청을 찾을 수 없습니다.");
      return;
    }

    console.log("친구 요청 수락 성공:", data);
    notify("친구 요청을 수락했습니다.");

    await renderSupabaseFriends();
  }

  // Supabase 친구 요청 전송
  async function sendSupabaseFriendRequest(receiverId) {
    const { data: { user }, error: authError } =
      await supabaseDev.auth.getUser();

    if (authError || !user) {
      notify("로그인이 필요합니다.");
      return;
    }

    if (user.id === receiverId) {
      notify("자기 자신에게 친구 요청을 보낼 수 없습니다.");
      return;
    }

    const { data, error } = await supabaseDev
      .from("friendships")
      .insert({
        requester_id: user.id,
        receiver_id: receiverId,
        status: "pending"
      })
      .select();

    if (error) {
      console.error("친구 요청 실패:", error.message);
      notify("친구 요청에 실패했습니다.");
      return;
    }

    console.log("친구 요청 성공:", data);
    notify("친구 요청을 보냈습니다.");

    await renderSupabaseFriends();
  }

  // Supabase 친구 삭제
  async function removeSupabaseFriend(friendshipId) {
    const confirmed = confirm(
      "정말 이 친구를 삭제하시겠습니까?"
    );

    if (!confirmed) return;

    const { error } = await supabaseDev
      .from("friendships")
      .delete()
      .eq("id", friendshipId)
      .eq("status", "accepted");

    if (error) {
      console.error("친구 삭제 실패:", error.message);
      notify("친구 삭제에 실패했습니다.");
      return;
    }

    notify("친구가 삭제되었습니다.");
    await renderSupabaseFriends();
  }

  let supabaseFriendships = [];


  // 개발용 A 계정 친구 요청 버튼
  async function renderDevFriendRequestButton() {
    const container = document.getElementById(
      "friend-search-results"
    );

    if (!container) return;

    const { data: { user } } =
      await supabaseDev.auth.getUser();

    if (!user) return;

    const accountA =
      "693e8c4a-4774-4ae8-9aef-0d82d28f4b8e";

    const accountB =
      "037d8d7a-58f0-4d1b-beff-5ef7b956f3bf";

        // A 또는 B 계정에서만 개발용 버튼 표시
    if (user.id !== accountA && user.id !== accountB) return;

    const { data, error } = await supabaseDev
      .from("friendships")
      .select("id")
      .or(
        `and(requester_id.eq.${accountA},receiver_id.eq.${accountB}),and(requester_id.eq.${accountB},receiver_id.eq.${accountA})`
      );

    if (error) {
      console.error("친구 관계 확인 실패:", error.message);
      return;
    }

    // 이미 친구 관계나 요청이 있다면 버튼 표시 안 함
    if (data.length > 0) return;

    
    const targetId = user.id === accountA ? accountB : accountA;
    const targetName = user.id === accountA ? "B" : "A";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "friend-btn";
    button.textContent = `테스트 사용자 ${targetName}에게 친구 요청`;

    button.addEventListener("click", async () => {
      button.disabled = true;

      try {
        await sendSupabaseFriendRequest(targetId);
      } finally {
        button.disabled = false;
      }
    });

    container.appendChild(button);

  }

  // Supabase에서 받은 친구 요청 표시
  async function renderSupabaseReceivedRequests() {
    const container =
      document.getElementById("friend-requests");

    if (!container) return;

    const { data: { user }, error: authError } =
      await supabaseDev.auth.getUser();

    if (authError || !user) return;

    const { data, error } = await supabaseDev
      .from("friendships")
      .select("id, requester_id")
      .eq("receiver_id", user.id)
      .eq("status", "pending");

    if (error) {
      console.error("받은 친구 요청 조회 실패:", error.message);
      return;
    }

    container.replaceChildren();

    if (data.length === 0) {
      const empty = document.createElement("p");
      empty.className = "muted";
      empty.textContent = "받은 친구 요청이 없습니다.";
      container.appendChild(empty);
      return;
    }

    for (const request of data) {
      const row = document.createElement("div");
      row.className = "friend-item";

      const info = document.createElement("div");
      info.className = "friend-info";

      const name = document.createElement("strong");
      name.textContent =
        await getRealUserName(request.requester_id);

      const acceptButton =
        document.createElement("button");

      acceptButton.type = "button";
      acceptButton.className = "friend-btn";
      acceptButton.textContent = "수락";

      acceptButton.addEventListener("click", async () => {
        acceptButton.disabled = true;

        await acceptSupabaseFriendRequest(request.id);
        await renderSupabaseReceivedRequests();
      });

      
      // 거절 버튼 생성
      const rejectButton = document.createElement("button");

      rejectButton.type = "button";
      rejectButton.className = "friend-btn secondary";
      rejectButton.textContent = "거절";

      rejectButton.addEventListener("click", async () => {
        const confirmed = confirm(
          "이 친구 요청을 거절하시겠습니까?"
        );

        if (!confirmed) return;

        rejectButton.disabled = true;
        await rejectSupabaseFriendRequest(request.id);
      });

      // 수락 / 거절 버튼을 나란히 배치
      const actions = document.createElement("div");
      actions.className = "friend-actions";

      actions.append(acceptButton, rejectButton);

      const department = document.createElement("small");
      department.textContent = "학과: " + await getUserDepartment(request.requester_id);
      info.append(name, department);
      row.append(info, actions);
      container.appendChild(row);

    }
  }

  // Supabase 친구 목록 화면 표시
  async function renderSupabaseFriends() {
    const container = document.getElementById("friend-list");
    if (!container) return;

    const { data: { user } } =
      await supabaseDev.auth.getUser();

    if (!user) return;

    const friendships = await loadSupabaseFriends();
    if (!friendships) return;
    supabaseFriendships = friendships;

    const friends = await Promise.all(
      friendships.map(async item => {
        const friendId =
          item.requester_id === user.id
            ? item.receiver_id
            : item.requester_id;

        return {
          id: friendId,
          name: await getRealUserName(friendId),
          department: await getUserDepartment(friendId)
        };
      })
    );
    
    
renderList("friend-list", friends, user => [
  {
    label: "1:1 채팅",
    action: "open-direct-chat"
  },
  {
    label: "친구 삭제",
    action: "remove-supabase",
    secondary: true
  }
]);


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

  
  let searchSequence = 0;

  async function searchFriends() {
    const input = document.getElementById("friend-search-input");
    const container = document.getElementById("friend-search-results");

    if (!input || !container) return;

    const keyword = input.value.trim();
    const sequence = ++searchSequence;

    container.replaceChildren();

    if (!keyword) {
      container.textContent = "이름을 입력해 주세요.";
      return;
    }

    const { data: { user }, error: authError } =
      await supabaseDev.auth.getUser();

    if (sequence !== searchSequence) return;

    if (authError || !user) {
      container.textContent = "로그인이 필요합니다.";
      return;
    }

    const { data: users, error } = await supabaseDev
      .from("profiles")
      .select("id, real_name")
      .ilike("real_name", `%${keyword}%`)
      .neq("id", user.id)
      .limit(20);

    if (sequence !== searchSequence) return;

    if (error) {
      console.error("친구 검색 실패:", error.message);
      container.textContent = "사용자 검색에 실패했습니다.";
      return;
    }

    if (!users || users.length === 0) {
      container.textContent = "검색 결과가 없습니다.";
      return;
    }

    const { data: relationships, error: relationError } =
      await supabaseDev
        .from("friendships")
        .select("requester_id, receiver_id, status")
        .or(`requester_id.eq.${user.id},receiver_id.eq.${user.id}`);

    if (sequence !== searchSequence) return;

    if (relationError) {
      console.error("친구 관계 조회 실패:", relationError.message);
      container.textContent = "친구 관계 확인에 실패했습니다.";
      return;
    }

    const blockedIds = new Set();

    for (const relation of relationships || []) {
      if (relation.status === "pending" ||
          relation.status === "accepted") {
        blockedIds.add(
          relation.requester_id === user.id
            ? relation.receiver_id
            : relation.requester_id
        );
      }
    }

    for (const foundUser of users) {
      const row = document.createElement("div");
      row.className = "friend-item";

      const name = document.createElement("strong");
      name.textContent =
        foundUser.real_name?.split("/")[0].trim() || "이름 미등록";

      const button = document.createElement("button");
      button.type = "button";
      button.className = "friend-btn";

      if (blockedIds.has(foundUser.id)) {
        button.textContent = "친구 관계 또는 요청 있음";
        button.disabled = true;
      } else {
        button.textContent = "친구 요청";

        button.addEventListener("click", async () => {
          button.disabled = true;
          await sendSupabaseFriendRequest(foundUser.id);
          await searchFriends();
        });
      }

      const department = document.createElement("small");
      department.textContent = "학과: " + await getUserDepartment(foundUser.id);
      const info = document.createElement("div");
      info.className = "friend-info";
      info.append(name, department);
      row.append(info, button);
      container.appendChild(row);
    }
  }


  function init() {
    const input = document.getElementById("friend-search-input");

    if (input) {
      input.addEventListener("input", searchFriends);
    }

    renderFriends();
    renderSupabaseFriends();
    renderSupabaseReceivedRequests();
    renderSupabaseSentRequests();
  }

async function loadSupabaseSentRequests() {
  const {
    data: { user },
    error: authError
  } = await supabaseDev.auth.getUser();

  if (authError || !user) {
    console.error("로그인 사용자 확인 실패");
    return [];
  }

  const { data, error } = await supabaseDev
    .from("friendships")
    .select("id, requester_id, receiver_id, status")
    .eq("requester_id", user.id)
    .eq("status", "pending");

  if (error) {
    console.error("보낸 친구 요청 조회 실패:", error.message);
    return [];
  }

  console.log("보낸 친구 요청:", data);

  return data || [];
}

async function cancelSupabaseFriendRequest(friendshipId) {
  const {
    data: { user },
    error: authError
  } = await supabaseDev.auth.getUser();

  if (authError || !user) {
    alert("로그인이 필요합니다.");
    return;
  }

  const { data, error } = await supabaseDev
    .from("friendships")
    .delete()
    .eq("id", friendshipId)
    .eq("requester_id", user.id)
    .eq("status", "pending")
    .select("id");

  if (error) {
    console.error("친구 요청 취소 실패:", error.message);
    alert("친구 요청 취소에 실패했습니다.");
    return;
  }

  if (!data || data.length === 0) {
    alert("취소할 친구 요청을 찾을 수 없습니다.");
    return;
  }

  alert("친구 요청을 취소했습니다.");

  await renderSupabaseSentRequests();
}


async function renderSupabaseSentRequests() {
  const container = document.getElementById(
    "friend-sent-requests"
  );

  if (!container) return;

  container.textContent = "불러오는 중...";

  const requests = await loadSupabaseSentRequests();

  container.innerHTML = "";

  if (requests.length === 0) {
    container.textContent = "보낸 친구 요청이 없습니다.";
    return;
  }

  requests.forEach((request) => {
    const row = document.createElement("div");
    row.className = "friend-row";

    const info = document.createElement("div");
    info.className = "friend-info";

    const name = document.createElement("strong");
    name.textContent = getDevUserName(
      request.receiver_id
    );

    const status = document.createElement("span");
    status.textContent = "수락 대기 중";


    // 요청 취소 버튼 생성
    const cancelButton = document.createElement("button");

    cancelButton.type = "button";
    cancelButton.className = "friend-btn secondary";
    cancelButton.textContent = "요청 취소";

    cancelButton.addEventListener("click", async () => {
      const confirmed = confirm(
        "보낸 친구 요청을 취소하시겠습니까?"
      );

      if (!confirmed) return;

      cancelButton.disabled = true;
      cancelButton.textContent = "취소 중...";

      
      try {
       await cancelSupabaseFriendRequest(request.id);
     } finally {
       cancelButton.disabled = false;
       cancelButton.textContent = "요청 취소";
     }

    });

    // 기존 사용자 정보와 취소 버튼 표시
    info.append(name, status);
    row.append(info, cancelButton);
    container.appendChild(row);

  });
}

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
