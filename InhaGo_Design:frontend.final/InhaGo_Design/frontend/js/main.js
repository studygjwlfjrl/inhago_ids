const seed=[{id:0,title:'본관 근처에서 밥 먹을 사람!',type:'food',place:'본관 학생식당',desc:'점심 같이 먹어요! 편하게 참여해 주세요.',count:3,max:4,distance:'320m'},{id:1,title:'농구 한 판 할 사람?',type:'exercise',place:'체육관',desc:'가볍게 농구할 친구를 찾습니다.',count:2,max:4,distance:'500m'},{id:2,title:'중간고사 스터디 구해요',type:'study',place:'정석학술정보관',desc:'함께 공부해요!',count:4,max:6,distance:'750m'},{id:3,title:'막차 택시팟 구해요',type:'taxi',place:'인하대역',desc:'택시 같이 타고 비용 나눠요.',count:2,max:4,distance:'1.2km'}];
const icons={food:'🍚',exercise:'🏀',study:'📚',taxi:'🚕'};
const key='inhago_step3_demo_v2';
let state;
try{state=JSON.parse(localStorage.getItem(key))}catch(e){}
if(!state||!Array.isArray(state.meetings))state={meetings:seed,joined:[],reviews:[],score:92,created:0};
const save=()=>localStorage.setItem(key,JSON.stringify(state));
const $=id=>document.getElementById(id);
let selected=0;
function toast(msg){$('toast').textContent=msg;$('toast').style.display='block';setTimeout(()=>$('toast').style.display='none',2600)}
function show(page){document.querySelectorAll('.page').forEach(e=>e.classList.remove('active'));$(page==='search'?'search-page':page==='create'?'create-page':page==='message'?'message-page':page==='chat'?'chat-page':page==='friend'?'friend-page':page==='profile'?'profile-page':'home').classList.add('active');document.querySelectorAll('.sidebar button').forEach(b=>b.classList.toggle('active',b.dataset.page===page));if(page==='profile')renderProfile();if(page==='search')renderSearch();}
document.querySelectorAll('[data-page]').forEach(b=>b.addEventListener('click',e=>{e.preventDefault();show(b.dataset.page)}));
function meetingHtml(m){return `<div class="meeting" data-open="${esc(m.id)}" tabindex="0" role="button"><span class="meeting-icon ${esc(m.type)}">${icons[m.type]||'📍'}</span><div class="meeting-info"><strong>${esc(m.title)}</strong><p>${esc(m.place)} · ${esc(m.distance)}</p><small>${m.count}/${m.max}명 참여 · 자세히 보기 →</small></div></div>`}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function renderCards(){$('cards').innerHTML=state.meetings.map(meetingHtml).join('');renderSearch();}
function renderSearch(){const q=$('search').value.trim().toLowerCase();$('search-results').innerHTML=state.meetings.filter(m=>[m.title,m.place,m.desc].join(' ').toLowerCase().includes(q)).map(meetingHtml).join('')||'<p class="muted">검색 결과가 없습니다.</p>';}
function openMeeting(id){let m=state.meetings.find(x=>String(x.id)===String(id));if(!m)return;selected=id;$('modal-icon').textContent=icons[m.type]||'📍';$('modal-title').textContent=m.title;$('modal-place').textContent='📍 '+m.place+' · '+m.distance;$('modal-desc').textContent=m.desc;$('modal-count').textContent=`참여 인원 ${m.count}/${m.max}명`;$('join').textContent=state.joined.some(x=>String(x)===String(id))?'참여 완료':m.count>=m.max?'모집 마감':'참여하기';$('join').disabled=state.joined.some(x=>String(x)===String(id))||m.count>=m.max;$('modal').showModal()}
document.addEventListener('click',e=>{let t=e.target.closest('[data-open],[data-id]');if(t)openMeeting(t.dataset.open??t.dataset.id)});
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.matches('[data-open]'))openMeeting(e.target.dataset.open)});
$('close-modal').onclick=()=>$('modal').close();
$('join').onclick=()=>{let m=state.meetings.find(x=>String(x.id)===String(selected));if(!m||m.count>=m.max||state.joined.some(x=>String(x)===String(selected)))return;if(apiMeetingsLoaded){toast('실제 모임 참여 연결은 아직 준비 중입니다.');return;}m.count++;state.joined.push(selected);save();renderCards();$('modal').close();toast('모임에 참여했어요! 프로필에서 후기를 남길 수 있어요.')};
$('search').addEventListener('input',()=>{show('search');renderSearch()});
$('create-form').addEventListener('submit',e=>{e.preventDefault();if(apiMeetingsLoaded){toast('실제 모임 생성 연결은 아직 준비 중입니다.');return;}let f=new FormData(e.target);let m={id:Date.now(),title:f.get('title').trim(),type:f.get('type'),place:f.get('place').trim(),desc:f.get('desc').trim()||'새로 등록된 모임입니다.',count:1,max:Number(f.get('max')),distance:'캠퍼스'};if(!m.title||!m.place)return;state.meetings.unshift(m);state.created++;save();e.target.reset();renderCards();show('home');toast('새 모임이 등록되었습니다 (이 브라우저에서만 표시).')});
function renderProfile(){$('score').textContent=state.score;$('header-score').textContent=state.score;$('aside-score').textContent=state.score+' / 100';$('score-bar').style.width=state.score+'%';$('score-label').textContent=state.score>=90?'좋은 매너를 유지하고 있어요!':state.score>=70?'서로 배려하는 캠퍼스를 만들어요!':'약속과 소통을 더 신경 써 주세요.';$('joined-count').textContent=state.joined.length;$('created-count').textContent=state.created;$('review-count').textContent=state.reviews.length;let available=state.meetings.filter(m=>state.joined.some(x=>String(x)===String(m.id))&&!state.reviews.some(x=>String(x)===String(m.id)));$('review-meeting').innerHTML=available.map(m=>`<option value="${esc(m.id)}">${esc(m.title)}</option>`).join('')||'<option value="">후기를 남길 참여 모임이 없습니다</option>';$('review-form').querySelector('button').disabled=!available.length}
$('review-form').addEventListener('submit',e=>{e.preventDefault();let id=$('review-meeting').value;if(!state.joined.some(x=>String(x)===id)||state.reviews.some(x=>String(x)===id))return;state.score=Math.max(0,Math.min(100,state.score+Number($('review-type').value)));state.reviews.push(id);save();renderProfile();toast('후기가 반영되었어요. 현재 점수는 시연용입니다.')});
$('reset-demo').onclick=()=>{if(!confirm('시연 데이터를 초기화할까요?'))return;localStorage.removeItem(key);location.reload()};

// 실제 백엔드 모임 목록 연동. 인증 토큰이 없으면 기존 시연 데이터를 유지합니다.
const API_BASE='https://inhago-backend.onrender.com';
let apiMeetingsLoaded=false;
async function loadMeetingsFromAPI(accessToken){
  if(!accessToken){console.info('로그인 토큰이 없어 시연 데이터를 표시합니다.');return;}
  try{
    const response=await fetch(`${API_BASE}/meetings`,{headers:{Authorization:`Bearer ${accessToken}`}});
    if(!response.ok)throw new Error(`모임 목록 요청 실패: HTTP ${response.status}`);
    const result=await response.json();
    if(!Array.isArray(result.meetings))throw new Error('모임 목록 응답 형식이 올바르지 않습니다.');
    state.meetings=result.meetings.map(m=>({id:m.id,title:m.title,type:m.category,place:m.location_name,desc:m.description||'',count:1,max:m.max_participants,distance:'캠퍼스'}));
    apiMeetingsLoaded=true;
    renderCards();renderProfile();
  }catch(error){console.error('모임 목록 API 오류:',error);}
}
// 실제 인증 연동 시 로그인 성공 후 loadMeetingsFromAPI(accessToken)을 호출하세요.
// 주의: 참여 인원(count)은 아직 실제 집계값이 아닙니다.
renderCards();
renderProfile();
