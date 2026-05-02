import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import postgres from "npm:postgres@3.4.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE, PATCH",
  "Access-Control-Max-Age": "86400",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("EXT_SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("EXT_SUPABASE_SERVICE_ROLE_KEY")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("EXT_SUPABASE_ANON_KEY")!;
const rawDbUrl = Deno.env.get("SUPABASE_DB_URL") ?? Deno.env.get("EXT_SUPABASE_DB_URL")!;
// URL-encode the password portion in case it contains special characters
const dbUrlMatch = rawDbUrl.match(/^(postgres(?:ql)?:\/\/[^:]+:)([^@]+)(@.+)$/);
const dbUrl = dbUrlMatch ? `${dbUrlMatch[1]}${encodeURIComponent(dbUrlMatch[2])}${dbUrlMatch[3]}` : rawDbUrl;

const sql = postgres(dbUrl, {
  prepare: false,
  ssl: "require",
  max: 1,
  idle_timeout: 5,
  connect_timeout: 10,
});

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  try {
    // Verify caller is a manager
    const authHeader = req.headers.get("Authorization")!;
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) return json({ error: "Unauthorized" }, 401);

    const roleCheck = await sql`SELECT role FROM public.user_roles WHERE user_id = ${caller.id}::uuid AND role IN ('manager','lead_admin')`;
    if (roleCheck.length === 0) return json({ error: "Only managers or lead admins can manage agents" }, 403);

    const body = await req.json();
    const { action } = body;

    // LIST: Return all agent users with emails (needs admin API)
    if (action === "list") {
      const roles = await sql`SELECT user_id FROM public.user_roles WHERE role = 'agent'`;
      if (roles.length === 0) return json({ users: [] });

      const users = [];
      for (const r of roles) {
        const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(r.user_id);
        if (user) users.push({ user_id: r.user_id, email: user.email });
      }
      return json({ users });
    }

    // DELETE: Remove agent (needs admin API to delete auth user)
    if (action === "delete") {
      const { user_id } = body;
      if (!user_id) return json({ error: "user_id required" }, 400);
      await sql`DELETE FROM public.active_breaks WHERE user_id = ${user_id}::uuid`;
      await sql`DELETE FROM public.break_sessions WHERE user_id = ${user_id}::uuid`;
      await sql`DELETE FROM public.break_approval_requests WHERE user_id = ${user_id}::uuid`;
      await sql`DELETE FROM public.user_roles WHERE user_id = ${user_id}::uuid`;
      await sql`DELETE FROM public.profiles WHERE user_id = ${user_id}::uuid`;
      const { error } = await supabaseAdmin.auth.admin.deleteUser(user_id);
      if (error) throw error;
      return json({ success: true });
    }

    return json({ error: "Invalid action" }, 400);
  } catch (err) {
    console.error("manage-agent error:", err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
