
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// 내 개발용 Supabase 프로젝트
const DEV_SUPABASE_URL =
  'https://vhburqlerlunlljcbwcs.supabase.co';

// 복사한 Publishable Key를 여기에 입력
const DEV_SUPABASE_KEY =
  'sb_publishable_aI0Cf5fO35PYetn9532F-w_MJNTnE09';

// 개발용 Supabase 연결
export const supabaseDev = createClient(
  DEV_SUPABASE_URL,
  DEV_SUPABASE_KEY
);
