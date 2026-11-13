import { createClient } from
  'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://vhburqlerlunlljcbwcs.supabase.co';
const SUPABASE_KEY = 'sb_publishable_aI0Cf5fO35PYetn9532F-w_MJNTnE09';

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);