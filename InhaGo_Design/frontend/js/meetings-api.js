import { supabase } from "./supabase.js";
const API_BASE = "http://127.0.0.1:8000";
async function request(path, options = {}) {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session) throw new Error("로그인이 필요합니다.");
  const response = await fetch(API_BASE + path, {
    ...options,
    headers: { Authorization: "Bearer " + session.access_token, "Content-Type": "application/json", ...(options.headers || {}) }
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(typeof body.detail === "string" ? body.detail : "요청 실패 (" + response.status + ")");
  }
  return response.json();
}
export const getMeetings = () => request("/meetings");
export const createMeeting = (data) => request("/meetings", { method: "POST", body: JSON.stringify(data) });
export const joinMeeting = (id) => request("/meetings/" + encodeURIComponent(id) + "/join", { method: "POST" });
