import { supabase } from "./supabase.js";
const API_BASE = "http://127.0.0.1:8000";
async function request(path, options = {}) {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session) throw new Error("로그인이 필요합니다.");
  let response;
  try { response = await fetch(API_BASE + path, {
    ...options,
    headers: { Authorization: "Bearer " + session.access_token, "Content-Type": "application/json", ...(options.headers || {}) }
  }); } catch (cause) {
    throw new Error("백엔드 서버에 연결할 수 없습니다. 터미널에서 FastAPI(127.0.0.1:8000)를 실행해 주세요.");
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(typeof body.detail === "string" ? body.detail : "요청 실패 (" + response.status + ")");
  }
  return response.json();
}
export const getMeetings = () => request("/meetings");
export const createMeeting = (data) => request("/meetings", { method: "POST", body: JSON.stringify(data) });
export const joinMeeting = (id) => request("/meetings/" + encodeURIComponent(id) + "/join", { method: "POST" });
