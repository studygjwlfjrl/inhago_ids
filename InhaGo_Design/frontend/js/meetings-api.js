import { supabase } from "./supabase.js";

// Set window.INHAGO_API_BASE before loading modules to override the local API.
const API_BASE = (window.INHAGO_API_BASE || "http://127.0.0.1:8000").replace(/\\/$/, "");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let apiOnline = null;
function reportConnection(online) {
  if (apiOnline === online) return;
  apiOnline = online;
  window.dispatchEvent(new CustomEvent("inhaGoApiStatus", { detail: { online } }));
}
async function request(path, options = {}) {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session) throw new Error("로그인이 필요합니다.");
  const method = (options.method || "GET").toUpperCase();
  const attempts = method === "GET" ? 3 : 1; // Never retry mutations automatically.
  for (let attempt = 0; attempt < attempts; attempt++) {
    let response;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        response = await fetch(API_BASE + path, {
          ...options,
          signal: controller.signal,
          headers: { Authorization: "Bearer " + session.access_token, "Content-Type": "application/json", ...(options.headers || {}) }
        });
      } finally { clearTimeout(timeout); }
    } catch (cause) {
      if (attempt + 1 < attempts) { await delay(500 * (attempt + 1)); continue; }
      reportConnection(false);
      throw new Error("백엔드 연결에 실패했습니다. FastAPI 서버 상태를 확인한 뒤 다시 시도해 주세요.");
    }
    reportConnection(true);
    if (!response.ok) {
      if (method === "GET" && response.status >= 500 && attempt + 1 < attempts) {
        await delay(500 * (attempt + 1));
        continue;
      }
      const body = await response.json().catch(() => ({}));
      throw new Error(typeof body.detail === "string" ? body.detail : "요청 실패 (" + response.status + ")");
    }
    return response.json();
  }
}
export const getMeetings = () => request("/meetings");
export const createMeeting = data => request("/meetings", { method: "POST", body: JSON.stringify(data) });
export const joinMeeting = id => request("/meetings/" + encodeURIComponent(id) + "/join", { method: "POST" });
export const getMyMeetings = () => request("/meetings/mine");
export const updateMeeting = (id, data) => request("/meetings/" + encodeURIComponent(id), { method: "PATCH", body: JSON.stringify(data) });
export const leaveMeeting = id => request("/meetings/" + encodeURIComponent(id) + "/leave", { method: "DELETE" });
export const cancelMeeting = id => request("/meetings/" + encodeURIComponent(id) + "/cancel", { method: "PATCH" });
export const completeMeeting = id => request("/meetings/" + encodeURIComponent(id) + "/complete", { method: "PATCH" });
