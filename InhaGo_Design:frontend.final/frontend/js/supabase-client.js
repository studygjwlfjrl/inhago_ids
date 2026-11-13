
/* InhaGo Shared Supabase Client */

(async () => {
  try {
    const { supabase } = await import("./supabase.js");

    window.inhagoSupabase = supabase;

    console.log("InhaGo shared Supabase client initialized.");
  } catch (error) {
    console.error("Supabase initialization failed:", error);
  }
})();
