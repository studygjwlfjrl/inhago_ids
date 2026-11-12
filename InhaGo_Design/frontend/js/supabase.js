
import { createClient } from
  'https://esm.sh/@supabase/supabase-js@2';

// 본인 Supabase 프로젝트 정보 입력
const SUPABASE_URL = 'https://hmvhnudpjhgsrupkndsg.supabase.co';
const SUPABASE_KEY = 'sb_publishable_M4H9xkjwpUhDr1Llofjm2w_iSGNd2r1';

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);
