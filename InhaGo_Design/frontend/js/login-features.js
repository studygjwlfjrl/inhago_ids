import { supabase } from './supabase.js';

const $ = id => document.getElementById(id);
const gradeImage = score => {
  const s = Number(score);
  const grade = s >= 95 ? 'Aplus' : s >= 84 ? 'A0' : s >= 73 ? 'Bplus' : s >= 62 ? 'B0' : s >= 50 ? 'Cplus' : s >= 39 ? 'C0' : s >= 28 ? 'Dplus' : s >= 11 ? 'D0' : 'F';
  return 'assets/induck_' + grade + '.svg';
};
function updateMascot(score) {
  if (!Number.isFinite(Number(score))) return;
  const image = gradeImage(score);
  document.querySelectorAll('#profile-page .profile-top img, .avatar-button img').forEach(el => {
    el.src = image;
    el.alt = '매너 점수에 따른 인덕이';
  });
}
window.addEventListener('inhaGoMannerScoreChanged', event => updateMascot(event.detail.score));
const msg = (id, text) => { if ($(id)) $(id).textContent = text; };
let currentUser = null;
let reviewMeetingsVersion = 0;
let reviewPeopleVersion = 0;
let departmentColumnAvailable = true;
const showDepartmentSetup = visible => { if ($('department-setup-note')) $('department-setup-note').hidden = !visible; };
async function loadProfile() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return;
  currentUser = user;
  let { data: profile, error: profileError } = await supabase.from('profiles').select('real_name,manner_score,department').eq('id', user.id).maybeSingle();
  if (profileError && /department|column|schema cache/i.test(profileError.message)) {
    departmentColumnAvailable = false;
    showDepartmentSetup(true);
    ({ data: profile, error: profileError } = await supabase.from('profiles').select('real_name,manner_score').eq('id', user.id).maybeSingle());
  } else { departmentColumnAvailable = true; showDepartmentSetup(false); }
  if (profileError) { console.error('프로필 조회 실패:', profileError); return; }
  const name = profile?.real_name?.trim() || '이름 미설정';
  if ($('profile-user-name')) $('profile-user-name').textContent = name;
  if ($('header-user-name')) $('header-user-name').textContent = name;
  if ($('real-name-input')) $('real-name-input').value = profile?.real_name || '';
  if ($('department-input')) $('department-input').value = profile?.department || '';
  if ($('profile-department')) $('profile-department').textContent = profile?.department?.trim() || '학과 미설정';
  if (Number.isInteger(profile?.manner_score)) {
    window.setMannerScore?.(profile.manner_score);
    updateMascot(profile.manner_score);
  }
}
$('real-name-form')?.addEventListener('submit', async event => {
  event.preventDefault();
  const name = $('real-name-input').value.trim();
  const department = $('department-input')?.value.trim() || '';
  if (name.length < 2 || name.length > 20) { msg('real-name-message','이름은 2~20자로 입력해 주세요.'); return; }
  if (!currentUser) { msg('real-name-message','로그인이 필요합니다.'); return; }
  const button = event.currentTarget.querySelector('button');
  button.disabled = true;
  try {
    const updates = departmentColumnAvailable ? { real_name: name, department: department || null } : { real_name: name };
    const { error } = await supabase.from('profiles').update(updates).eq('id', currentUser.id);
    if (error) throw error;
    if ($('profile-user-name')) $('profile-user-name').textContent = name;
    if ($('header-user-name')) $('header-user-name').textContent = name;
    if (departmentColumnAvailable && $('profile-department')) $('profile-department').textContent = department || '학과 미설정';
    msg('real-name-message', departmentColumnAvailable ? '이름과 학과가 저장되었습니다.' : '이름이 저장되었습니다. 학과 저장은 DB 설정이 필요합니다.');
  } catch (error) { msg('real-name-message','저장 실패: '+error.message); }
  finally { button.disabled = false; }
});
async function loadReviewMeetings() {
  const version = ++reviewMeetingsVersion;
  ++reviewPeopleVersion; // Invalidate in-flight people lookups when meeting list refreshes.
  if (!currentUser) return;
  const meetingSelect = $('review-meeting'), personSelect = $('review-person');
  const previous = meetingSelect.value;
  meetingSelect.disabled = true;
  meetingSelect.replaceChildren(new Option('모임을 선택하세요', ''));
  personSelect.replaceChildren(new Option('참여자를 선택하세요', ''));
  // 모임장은 meeting_participants에 등록되지 않을 수 있으므로 별도로 조회합니다.
  const [participationResult, createdResult] = await Promise.all([
    supabase.from('meeting_participants').select('meeting_id')
      .eq('user_id', currentUser.id).eq('status', 'joined'),
    supabase.from('meetings').select('id,title,status')
      .eq('creator_id', currentUser.id).eq('status', 'completed')
  ]);
  if (version !== reviewMeetingsVersion) return;
  const err = participationResult.error || createdResult.error;
  if (err) { msg('review-message', '평가 모임 조회 실패: ' + err.message); return; }
  const ids = [...new Set((participationResult.data || []).map(r => r.meeting_id))];
  let participated = [];
  if (ids.length) {
    const result = await supabase.from('meetings').select('id,title,status')
      .in('id', ids).eq('status', 'completed');
    if (version !== reviewMeetingsVersion) return;
    if (result.error) { msg('review-message', '완료된 모임 조회 실패: ' + result.error.message); return; }
    participated = result.data || [];
  }
  const meetings = [...new Map([...(createdResult.data || []), ...participated].map(m => [String(m.id),m])).values()];
  for (const m of meetings) meetingSelect.add(new Option(m.title, m.id));
  meetingSelect.disabled = false;
  if (meetings.some(m => String(m.id) === previous)) {
    meetingSelect.value = previous;
    await loadReviewPeople();
  } else {
    msg('review-message', meetings.length ? '평가할 모임을 선택하세요.' : '아직 평가 가능한 완료된 모임이 없습니다.');
  }
}
async function loadReviewPeople() {
  const version = ++reviewPeopleVersion;
  const id = $('review-meeting').value;
  const personSelect = $('review-person');
  personSelect.replaceChildren(new Option('참여자를 선택하세요', ''));
  personSelect.disabled = true;
  if (!id || !currentUser) return;
  const [membersResult, reviewsResult, meetingResult] = await Promise.all([
    supabase.from('meeting_participants').select('user_id').eq('meeting_id', id).eq('status', 'joined'),
    supabase.from('manner_reviews').select('reviewee_id').eq('meeting_id', id).eq('reviewer_id', currentUser.id),
    supabase.from('meetings').select('creator_id,status').eq('id', id).single()
  ]);
  if (version !== reviewPeopleVersion || $('review-meeting').value !== id) return;
  const err = membersResult.error || reviewsResult.error || meetingResult.error;
  if (err) { msg('review-message', '평가 대상 조회 실패: ' + err.message); return; }
  if (meetingResult.data.status !== 'completed') {
    msg('review-message', '완료된 모임만 평가할 수 있습니다.'); return;
  }
  const creator = meetingResult.data.creator_id;
  const members = (membersResult.data || []).map(r => r.user_id);
  if (creator !== currentUser.id && !members.includes(currentUser.id)) {
    msg('review-message', '참여한 모임만 평가할 수 있습니다.'); return;
  }
  const reviewed = new Set((reviewsResult.data || []).map(r => String(r.reviewee_id)));
  const candidates = [...new Set([...members, creator])]
    .filter(uid => uid && uid !== currentUser.id && !reviewed.has(String(uid)));
  if (!candidates.length) {
    msg('review-message', '평가할 다른 참여자가 없거나 이미 모두 평가했습니다.'); return;
  }
  // 프로필 조회 RLS가 일부 사용자 행을 숨기더라도 평가 대상은 유지합니다.
  const { data: profiles, error: profileError } = await supabase.from('profiles')
    .select('id,real_name').in('id', candidates);
  if (version !== reviewPeopleVersion || $('review-meeting').value !== id) return;
  if (profileError) console.warn('평가 대상 프로필 일부 조회 실패:', profileError);
  const names = new Map((profiles || []).map(p => [String(p.id), p.real_name]));
  for (const uid of candidates) {
    personSelect.add(new Option(names.get(String(uid))?.trim() || '이름 미설정 (' + String(uid).slice(0,8) + ')', uid));
  }
  personSelect.disabled = false;
  msg('review-message', candidates.length + '명을 평가할 수 있습니다.');
}
$('review-meeting')?.addEventListener('change',loadReviewPeople);
$('review-form')?.addEventListener('submit',async event=>{
  event.preventDefault();
  const meetingId=$('review-meeting').value, revieweeId=$('review-person').value, grade=$('review-type').value;
  if (!currentUser || !meetingId || !revieweeId || !grade || revieweeId===currentUser.id) {
    msg('review-message','모임, 참여자, 학점을 확인해 주세요.'); return;
  }
  const button=event.currentTarget.querySelector('[type="submit"]');button.disabled=true;
  try {
    const {error}=await supabase.from('manner_reviews').insert({meeting_id:meetingId,reviewer_id:currentUser.id,reviewee_id:revieweeId,grade});
    if(error)throw error;
    // Remove the newly rated person immediately, before a network refresh.
    ++reviewPeopleVersion;
    const personSelect = $('review-person');
    for (const option of [...personSelect.options]) {
      if (option.value === revieweeId) option.remove();
    }
    personSelect.value = '';
    if (personSelect.options.length <= 1) personSelect.disabled = true;
    if ($('review-meeting').value === meetingId) await loadReviewPeople();
    msg('review-message',grade+' 학점 평가가 저장되었습니다.');
  }catch(error){msg('review-message','평가 저장 실패: '+error.message);}
  finally{button.disabled=false;}
});
window.addEventListener('inhaGoLoginSuccess',async()=>{await loadProfile();await loadReviewMeetings();});
window.addEventListener('inhaGoMeetingsChanged',loadReviewMeetings);
supabase.auth.getSession().then(async ({data})=>{if(data.session){await loadProfile();await loadReviewMeetings();}}).catch(console.error);
document.querySelectorAll('[data-page="profile"]').forEach(el=>el.addEventListener('click',()=>{loadProfile();loadReviewMeetings();}));
