import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import postgres from "npm:postgres@3.4.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type AppRole = "agent" | "manager";

const isAppRole = (value: unknown): value is AppRole => value === "agent" || value === "manager";

const stringifyError = (err: unknown): string => {
  if (err instanceof Error) return err.message;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
};

const supabaseUrl = Deno.env.get("EXT_SUPABASE_URL");
const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
const dbUrl = Deno.env.get("EXT_SUPABASE_DB_URL");

const sql = dbUrl
  ? postgres(dbUrl, {
      prepare: false,
      ssl: "require",
      max: 1,
      idle_timeout: 5,
      connect_timeout: 10,
    })
  : null;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (!supabaseUrl || !anonKey || !sql) {
    return new Response(JSON.stringify({ error: "Server configuration error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await callerClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const jwtRoleCandidate = user.user_metadata?.app_role ?? user.user_metadata?.role ?? user.app_metadata?.app_role;
    const jwtRole = isAppRole(jwtRoleCandidate) ? jwtRoleCandidate : null;

    const [profileRows, roleRows] = await Promise.all([
      sql<{ display_name: string | null }[]>`select display_name from public.profiles where user_id = ${user.id}::uuid limit 1`,
      sql<{ role: string }[]>`select role::text as role from public.user_roles where user_id = ${user.id}::uuid limit 1`,
    ]);

    const roleCandidate = jwtRole ?? roleRows[0]?.role ?? null;
    const role = isAppRole(roleCandidate) ? roleCandidate : null;

    return new Response(JSON.stringify({
      profile: { display_name: profileRows[0]?.display_name ?? user.user_metadata?.display_name ?? user.email ?? "User" },
      role,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const errorMessage = stringifyError(err);
    console.error("auth-bootstrap failure:", errorMessage);

    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 503,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
