/* InhaGo 알림 센터: 현재 Supabase 테이블 기반, 읽음 상태는 브라우저별 저장 */
import { supabase } from './supabase.js';

const button = document.getElementById('notification-button');
const panel = document.getElementById('notification-panel');
const list = document.getElementById('notification-list');
const countBadge = document.getElementById('chat-unread-count');
const bellBadge = document.getElementById('notification-count');
let userId = null;
let refreshing = false;
let lastItems = [];
let roomReads = {};
let dismissed = {};
let initialized = false;
let refreshToken = 0;
const getStore = (name) => { try { return JSON.parse(localStorage.getItem(name) || '{}'); } catch { return {}; } };
const setStore = (name, value) => localStorage.setItem(name, JSON.stringify(value));
const readKey = () => 'inhago-room-reads-' + userId;
const dismissKey = () => 'inhago-notification-seen-' + userId;
const roomKey = (type, id) => type + ':' + id;
const timeOf = value => Number.isFinite(Date.parse(value)) ? Date.parse(value) : 0;

function updateBadges() {
  const unread = lastItems.filter(item => !dismissed[item.id]);
  const messageCount = unread.filter(item => item.type === 'message').length;
  if (bellBadge) { bellBadge.textContent = String(unread.length > 99 ? '99+' : unread.length); bellBadge.hidden = !unread.length; }
  if (countBadge) { countBadge.textContent = String(messageCount > 99 ? '99+' : messageCount); countBadge.hidden = !messageCount; }
  const dot = button?.querySelector('.notification-dot');
  if (dot) dot.hidden = !unread.length;
}

function render() {
  if (!list) return;
  list.replaceChildren();
  const unread = lastItems.filter(item => !dismissed[item.id]);
  if (!unread.length) { list.textContent = '새 알림이 없습니다.'; updateBadges(); return; }
  for (const item of unread) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'notification-entry';
    const title = document.createElement('strong');
    title.textContent = item.title;
    const details = document.createElement('small');
    details.textContent = item.details;
    row.append(title, details);
    row.addEventListener('click', () => {
      dismissed[item.id] = true;
      setStore(dismissKey(), dismissed);
      if (item.room) {
        roomReads[item.room] = new Date().toISOString();
        setStore(readKey(), roomReads);
      }
      render();
      panel.hidden = true;
      if (item.page) document.querySelector('[data-page="' + item.page + '"]')?.click();
    });
    list.append(row);
  }
  updateBadges();
}

async function query(table, fields, configure) {
  let request = supabase.from(table).select(fields);
  if (configure) request = configure(request);
  const {data, error} = await request;
  if (error) throw error;
  return data || [];
}

async function refresh() {
  if (refreshing || !panel || !button) return;
  refreshing = true;
  const token = ++refreshToken;
  try {
    const {data:{user}} = await supabase.auth.getUser();
    if (!user) { userId = null; lastItems = []; dismissed = {}; render(); return; }
    if (userId !== user.id) {
      userId = user.id;
      roomReads = getStore(readKey());
      dismissed = getStore(dismissKey());
    }
    const now = Date.now();
    const items = [];
    const results = await Promise.allSettled([
      query('friendships','id,requester_id', q=>q.eq('receiver_id',user.id).eq('status','pending')),
      query('direct_messages','id,sender_id,created_at',q=>q.eq('receiver_id',user.id).order('created_at',{ascending:false}).limit(100)),
      query('meeting_participants','meeting_id',q=>q.eq('user_id',user.id).eq('status','joined')),
      query('meetings','id,title,meeting_time,status',q=>q.eq('creator_id',user.id).eq('status','open'))
    ]);
    const [requests, direct, memberships, created] = results.map((result, index) => {
      if (result.status === 'fulfilled') return result.value;
      console.warn('알림 소스 ' + index + ' 조회 실패:', result.reason);
      return [];
    });
    if (token !== refreshToken) return;
    for (const request of requests) items.push({id:'friend:'+request.id,type:'friend',title:'새 친구 요청',details:'친구 요청이 도착했습니다.',page:'friend'});
    for (const msg of direct) {
      const room = roomKey('dm',msg.sender_id);
      if (timeOf(msg.created_at) <= timeOf(roomReads[room])) continue;
      items.push({id:'dm:'+msg.id,type:'message',title:'새 메시지',details:'친구에게 메시지가 도착했습니다.',page:'message',room});
    }
    const ids = [...new Set(memberships.map(m=>m.meeting_id))].filter(id=>!created.some(m=>String(m.id)===String(id)));
    let joined = [];
    if (ids.length) joined = await query('meetings','id,title,meeting_time,status',q=>q.in('id',ids).eq('status','open'));
    for (const meeting of [...created,...joined]) {
      const diff = timeOf(meeting.meeting_time) - now;
      if (diff > 0 && diff <= 60*60*1000) {
        items.push({id:'reminder:'+meeting.id+':'+meeting.meeting_time,type:'reminder',title:'모임 시작이 가까워요',details:meeting.title+' · 1시간 이내 시작',page:'profile'});
      }
    }
    const activeMeetingIds = [...new Set([...created,...joined].map(m=>m.id))];
    if (activeMeetingIds.length) {
      const groupMessages = await query('chat_messages','id,meeting_id,sender_id,created_at',q=>q.in('meeting_id',activeMeetingIds).neq('sender_id',user.id).order('created_at',{ascending:false}).limit(100));
      for (const msg of groupMessages) {
        const room = roomKey('meeting',msg.meeting_id);
        if (timeOf(msg.created_at) <= timeOf(roomReads[room])) continue;
        items.push({id:'group:'+msg.id,type:'message',title:'모임 채팅 메시지',details:'참여 중인 모임에 새 메시지가 있습니다.',page:'chat',room});
      }
    }
    // 취소된 모임은 채팅 목록에서 제외되며 리마인드에도 포함되지 않습니다.
    lastItems = items;
    render();
  } catch (error) {
    console.warn('알림 새로고침 실패:', error);
    if (list && !lastItems.length) list.textContent = '알림을 불러오지 못했습니다.';
  } finally { refreshing = false; }
}

button?.addEventListener('click', () => { if (!panel?.hidden) void refresh(); });
document.getElementById('notification-mark-read')?.addEventListener('click', () => {
  for (const item of lastItems) dismissed[item.id] = true;
  if (userId) setStore(dismissKey(), dismissed);
  render();
});
window.addEventListener('inhaGoRoomRead', event => {
  if (!userId || !event.detail) return;
  const room = roomKey(event.detail.type,event.detail.id);
  roomReads[room] = new Date().toISOString();
  setStore(readKey(),roomReads);
  for (const item of lastItems) if (item.room === room) dismissed[item.id] = true;
  setStore(dismissKey(),dismissed);
  render();
});
window.addEventListener('inhaGoLoginSuccess', () => void refresh());
window.addEventListener('inhaGoMeetingsChanged', () => void refresh());
window.addEventListener('focus', () => void refresh());
document.addEventListener('visibilitychange', () => { if (!document.hidden) void refresh(); });
void refresh();
setInterval(() => { if (!document.hidden) void refresh(); }, 30000);
