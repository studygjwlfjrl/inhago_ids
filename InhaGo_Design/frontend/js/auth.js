
import { supabase } from './supabase.js';

export async function sendVerificationCode(email) {
  const normalizedEmail = email.trim().toLowerCase();

  // 인하대학교 이메일만 허용
  if (
    !normalizedEmail.endsWith('@inha.edu') &&
    !normalizedEmail.endsWith('@inha.ac.kr')
  ) {
    throw new Error('인하대학교 이메일을 입력해 주세요.');
  }

  const { error } = await supabase.auth.signInWithOtp({
    email: normalizedEmail,
    options: {
      shouldCreateUser: true
    }
  });

  if (error) throw error;

  return '인증 이메일 발송을 요청했어요.';
}

export async function verifyCode(email, token) {
  const { data, error } = await supabase.auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token: token.trim(),
    type: 'email'
  });

  if (error) throw error;

  return data;
}

