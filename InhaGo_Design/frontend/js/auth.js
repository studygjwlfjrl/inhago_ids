
import { supabase } from './supabase.js';

// 구글 로그인
export async function loginWithGoogle() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin + window.location.pathname
    }
  });

  if (error) throw error;

  return data;
}

// 로그인한 사용자 확인
export async function checkLoginStatus() {
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return null;
  }

  return data.user;
}

// 인하대학교 이메일 확인
export function isInhaEmail(email) {
  if (!email) return false;

  return email.toLowerCase().endsWith('@inha.edu');
}

// 로그아웃
export async function logout() {
  const { error } = await supabase.auth.signOut();

  if (error) throw error;
}
