import { supabase } from './supabase.js';
import { getMyMeetings, updateMeeting, cancelMeeting, leaveMeeting, completeMeeting } from './meetings-api.js';

const $ = id => document.getElementById(id);
let meetings = [], currentUserId = null, editingId = null, loadVersion = 0, hasLoaded = false;
const notify = message => {
  const el = $('toast');
  if (!el) return;
  el.textContent = message;
  el.style.display = 'block';
  setTimeout(() => { if (el.textContent === message) el.style.display = 'none'; }, 5000);
};
const dateLabel = value => new Date(value).toLocaleString('ko-KR');
const localDate = value => {
  const d = new Date(value);
  const pad = n => String(n).padStart(2, '0');
  return [d.getFullYear(), pad(d.getMonth()+1), pad(d.getDate())].join('-') + 'T' + [pad(d.getHours()),pad(d.getMinutes())].join(':');
};
function action(label, callback, danger=false) {
  const btn = document.createElement('button');
  btn.type='button';btn.textContent=label;btn.className=danger?'secondary':'primary';
  btn.style.margin='4px';btn.addEventListener('click',async()=>{
    btn.disabled=true;
    try { await callback(); } catch(e) { notify(e.message); } finally { btn.disabled=false; }
  });
  return btn;
}
async function runChange(fn, message) {
  await fn();
  notify(message);
  window.dispatchEvent(new Event('inhaGoMeetingsChanged'));
  await load();
}
function render() {
  const container = $('my-meetings-list');
  if (!container) return;
  container.replaceChildren();
  if (!meetings.length) { container.textContent='아직 생성하거나 참여한 모임이 없습니다.'; return; }
  for (const m of meetings) {
    const mine=m.creator_id===currentUserId;
    const row=document.createElement('div');row.className='meeting';
    row.style.cssText='display:block;padding:14px;margin:8px 0';
    const title=document.createElement('strong');title.textContent=m.title;
    const info=document.createElement('p');info.className='muted';
    info.textContent=[mine?'내가 만든 모임':'참여한 모임',m.status,dateLabel(m.meeting_time),m.location_name].join(' · ');
    const buttons=document.createElement('div');
    if(mine && m.status==='open') {
      buttons.append(action('수정',()=>openEdit(m)));
      buttons.append(action('취소',async()=>{
        if(!confirm('이 모임을 취소할까요?'))return;
        await cancelMeeting(m.id);
        meetings = meetings.filter(item => String(item.id) !== String(m.id));
        render();
        notify('모임을 취소했습니다.');
        window.dispatchEvent(new Event('inhaGoMeetingsChanged'));
        await load();
      },true));
      if(new Date(m.meeting_time)<=new Date())buttons.append(action('완료 처리',()=>runChange(()=>completeMeeting(m.id),'모임을 완료했습니다. 이제 참여자를 평가할 수 있습니다.')));
    } else if(!mine && m.status==='open') {
      buttons.append(action('참여 탈퇴',async()=>{
        if(!confirm('이 모임에서 탈퇴할까요?'))return;
        await runChange(()=>leaveMeeting(m.id),'모임에서 탈퇴했습니다.');
      },true));
    }
    row.append(title,info,buttons);container.append(row);
  }
}
async function load() {
  const version = ++loadVersion;
  const container=$('my-meetings-list');
  if(!container)return;
  try {
    const {data:{user}}=await supabase.auth.getUser();
    if(!user){container.textContent='로그인이 필요합니다.';return;}
    if(version!==loadVersion)return;
    currentUserId=user.id;
    const result=await getMyMeetings();
    if(version!==loadVersion)return;
    meetings=result.meetings||[];
    hasLoaded=true;
    render();
  }catch(e){if(version!==loadVersion)return;console.error('내 모임 조회 실패',e);if(hasLoaded){render();const notice=document.createElement('p');notice.className='muted';notice.textContent='서버 연결 문제로 이전 조회 결과를 표시하고 있습니다. '+e.message;container.prepend(notice);}else{container.textContent='내 모임 조회 실패: '+e.message;}}
}
function openEdit(m) {
  editingId=m.id;
  const form=$('edit-meeting-form');
  form.elements.title.value=m.title;
  form.elements.place.value=m.location_name;
  form.elements.description.value=m.description||'';
  form.elements.meeting_time.value=localDate(m.meeting_time);
  form.elements.max_participants.value=String(m.max_participants);
  $('edit-meeting-dialog').showModal();
}
$('edit-meeting-close')?.addEventListener('click',()=>$('edit-meeting-dialog').close());
$('edit-meeting-form')?.addEventListener('submit',async e=>{
  e.preventDefault();
  const form=e.currentTarget,button=form.querySelector('[type=submit]');
  const d=new Date(form.elements.meeting_time.value);
  if(!Number.isFinite(d.getTime())||d<=new Date()){notify('미래의 모임 시간을 입력해 주세요.');return;}
  button.disabled=true;
  try {
    await runChange(()=>updateMeeting(editingId,{
      title:form.elements.title.value.trim(),location_name:form.elements.place.value.trim(),
      description:form.elements.description.value,meeting_time:d.toISOString(),
      max_participants:Number(form.elements.max_participants.value)
    }),'모임을 수정했습니다.');
    $('edit-meeting-dialog').close();
  }catch(error){notify(error.message);}finally{button.disabled=false;}
});
window.addEventListener('inhaGoLoginSuccess',load);
window.addEventListener('inhaGoApiStatus',event=>{if(event.detail.online)load();});
window.addEventListener('online',load);
window.addEventListener('inhaGoMeetingsChanged',load);
document.querySelectorAll('[data-page="profile"]').forEach(el=>el.addEventListener('click',load));
supabase.auth.getSession().then(({data})=>{if(data.session)load();}).catch(console.error);
