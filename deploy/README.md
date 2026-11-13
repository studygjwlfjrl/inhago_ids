# InhaGo deployment (Render Blueprint)

1. Push this branch to GitHub and create a Render Blueprint from render.yaml. Check available plan/pricing before creation.
2. Set backend SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and FRONTEND_ORIGINS (the exact frontend https origin, no trailing slash).
3. Set frontend INHAGO_API_BASE (the Render API https URL, no trailing slash) and GOOGLE_MAPS_API_KEY (Google Maps browser key). Deploy/redeploy the static site after setting variables.
4. Visit https://<frontend-host>/; the root redirects to /InhaGo_Design/frontend/. Map files are published at /map/ so existing relative paths work.
5. Configure Supabase Auth allowed site/redirect URLs for the frontend domain. Restrict the Maps browser key by HTTP referrer and enable Maps JavaScript API.
6. Test login, map, meetings, friend requests, chat, profile updates and CORS on the public domain.

Security: static map/config.js is visible in browser; never put a Google server key, Supabase service_role or any secret there. Browser Maps keys must be referrer-restricted. The demo key quota issue is not fixed by deploying. Review Supabase RLS before public access.
