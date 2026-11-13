import { supabase } from "./supabase.js";

// Supabase Auth sessions are attached automatically by supabase-js.
// Authorization is enforced by database RLS and the RPC functions, never by this client alone.
let apiOnline = null;
function reportConnection(online) {
  if (apiOnline === online) return;
  apiOnline = online;
  window.dispatchEvent(new CustomEvent("inhaGoApiStatus", { detail: { online } }));
}
function fail(error, fallback) {
  reportConnection(false);
  throw new Error(error?.message || fallback);
}
async function currentUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("로그인이 필요합니다.");
  return data.user;
}
async function run(query, fallback) {
  try {
    const { data, error } = await query;
    if (error) return fail(error, fallback);
    reportConnection(true);
    return data;
  } catch (error) {
    return fail(error, fallback);
  }
}
const now = () => new Date().toISOString();
const meetingFields = "id,title,description,category,location_name,latitude,longitude,meeting_time,max_participants,status,creator_id";
const normalizeCategory = category => category === "food" ? "meal" : category;
function cleanMeeting(data, partial = false) {
  const allowed = ["title", "description", "category", "location_name", "latitude", "longitude", "meeting_time", "max_participants"];
  const result = Object.fromEntries(allowed.filter(k => Object.hasOwn(data, k)).map(k => [k, data[k]]));
  if (Object.hasOwn(result, "category")) result.category = normalizeCategory(result.category);
  if (Object.hasOwn(result, "title") && (!result.title?.trim() || result.title.length > 100)) throw new Error("모임 이름은 1~100자로 입력해 주세요.");
  if (Object.hasOwn(result, "location_name") && !result.location_name?.trim()) throw new Error("장소를 입력해 주세요.");
  if (Object.hasOwn(result, "max_participants") && (!Number.isInteger(result.max_participants) || result.max_participants < 2)) throw new Error("최대 인원은 2명 이상이어야 합니다.");
  if (Object.hasOwn(result, "meeting_time") && !(new Date(result.meeting_time) > new Date())) throw new Error("미래의 모임 시간을 선택해 주세요.");
  for (const [field, min, max] of [["latitude",-90,90],["longitude",-180,180]]) {
    if (result[field] != null && (!Number.isFinite(result[field]) || result[field] < min || result[field] > max)) throw new Error("위치 좌표가 올바르지 않습니다.");
  }
  if (!partial && (!result.title || !result.location_name || !result.category || !result.meeting_time)) throw new Error("필수 모임 정보를 입력해 주세요.");
  return result;
}
async function withCounts(meetings) {
  if (!meetings.length) return meetings;
  const ids = meetings.map(m => m.id);
  const rows = await run(supabase.from("meeting_participants").select("meeting_id,user_id").in("meeting_id", ids).eq("status", "joined"), "참여 인원을 확인하지 못했습니다.");
  const byMeeting = new Map();
  for (const r of rows || []) {
    if (!byMeeting.has(r.meeting_id)) byMeeting.set(r.meeting_id, new Set());
    byMeeting.get(r.meeting_id).add(r.user_id);
  }
  return meetings.map(m => ({ ...m, participant_count: new Set([m.creator_id, ...(byMeeting.get(m.id) || [])]).size }));
}
export async function getMeetings() {
  await currentUser();
  const rows = await run(supabase.from("meetings").select(meetingFields).eq("status", "open").gte("meeting_time", now()).order("meeting_time"), "모임을 불러오지 못했습니다.");
  return { meetings: await withCounts(rows || []) };
}
export async function createMeeting(data) {
  const user = await currentUser();
  const meeting = cleanMeeting(data);
  const rows = await run(supabase.from("meetings").insert({ ...meeting, creator_id: user.id, status: "open" }).select("*"), "모임을 생성하지 못했습니다.");
  return { meeting: rows?.[0] };
}
export async function joinMeeting(id) {
  await currentUser();
  const participant = await run(supabase.rpc("join_meeting_safe", { p_meeting_id: id }), "모임 참여에 실패했습니다.");
  if (!participant) throw new Error("모임 참여 결과를 확인할 수 없습니다.");
  return { message: "모임 참여가 완료되었습니다.", participant };
}
export async function getMyMeetings() {
  const user = await currentUser();
  const created = await run(supabase.from("meetings").select("*").eq("creator_id", user.id), "내 모임을 불러오지 못했습니다.");
  const memberships = await run(supabase.from("meeting_participants").select("meeting_id").eq("user_id", user.id).eq("status", "joined"), "내 참여 목록을 불러오지 못했습니다.");
  const ids = [...new Set((memberships || []).map(x => x.meeting_id))];
  const joined = ids.length ? await run(supabase.from("meetings").select("*").in("id", ids), "내 모임을 불러오지 못했습니다.") : [];
  return { meetings: [...new Map([...(created || []), ...(joined || [])].map(m => [m.id, m])).values()].sort((a,b) => String(b.meeting_time).localeCompare(String(a.meeting_time))) };
}
export async function updateMeeting(id, data) {
  const user = await currentUser();
  const changes = cleanMeeting(data, true);
  if (!Object.keys(changes).length) throw new Error("수정할 항목이 없습니다.");
  const rows = await run(supabase.from("meetings").update(changes).eq("id", id).eq("creator_id", user.id).eq("status", "open").select("*"), "모임 수정에 실패했습니다.");
  if (!rows?.length) throw new Error("수정 가능한 모임이 없거나 권한이 없습니다.");
  return { message: "모임 수정이 완료되었습니다.", meeting: rows[0] };
}
export async function leaveMeeting(id) {
  const user = await currentUser();
  const rows = await run(supabase.from("meeting_participants").delete().eq("meeting_id", id).eq("user_id", user.id).select("id"), "모임 탈퇴에 실패했습니다.");
  if (!rows?.length) throw new Error("참여 중인 모임을 찾을 수 없습니다.");
  return { message: "모임 탈퇴가 완료되었습니다." };
}
export async function cancelMeeting(id) {
  const user = await currentUser();
  const rows = await run(supabase.from("meetings").update({ status: "cancelled" }).eq("id", id).eq("creator_id", user.id).eq("status", "open").select("id,title,status"), "모임 취소에 실패했습니다.");
  if (!rows?.length) throw new Error("취소할 수 있는 모임이 없거나 모임장이 아닙니다.");
  return { message: "모임 취소가 완료되었습니다.", meeting: rows[0] };
}
export async function completeMeeting(id) {
  await currentUser();
  const meeting = await run(supabase.rpc("complete_meeting_safe", { p_meeting_id: id }), "모임 완료 처리에 실패했습니다.");
  return { message: "모임이 완료되었습니다.", meeting };
}
