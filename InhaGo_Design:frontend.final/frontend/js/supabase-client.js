
/* InhaGo Supabase Client Configuration */

(() => {
  "use strict";

  // Supabase Project URL
  const SUPABASE_URL =
    "https://vhburqlerlunlljcbwcs.supabase.co";

  // Supabase Publishable Key
  const SUPABASE_PUBLISHABLE_KEY =
    "sb_publishable_aI0Cf5fO35PYetn9532F-w_MJNTnE09";

  // Check if Supabase library is loaded
  if (!window.supabase) {
    console.error("Supabase library is not loaded.");
    return;
  }

  // Create shared Supabase client
  window.inhagoSupabase = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
  );

  console.log("InhaGo Supabase client initialized.");
})();
