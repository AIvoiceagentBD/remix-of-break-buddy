import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import postgres from "npm:postgres@3.4.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const supabaseUrl = Deno.env.get("EXT_SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("EXT_SUPABASE_SERVICE_ROLE_KEY")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const dbUrl = Deno.env.get("EXT_SUPABASE_DB_URL")!;

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
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Verify caller is a manager
    const authHeader = req.headers.get("Authorization")!;
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) return json({ error: "Unauthorized" }, 401);

    const roleCheck = await sql`SELECT role FROM public.user_roles WHERE user_id = ${caller.id}::uuid AND role = 'manager' LIMIT 1`;
    if (roleCheck.length === 0) return json({ error: "Only managers can manage agents" }, 403);

    const body = await req.json();
    const { action } = body;

    // LIST: Return all agent users with emails
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

    if (action === "update") {
      const { user_id, display_name } = body;
      if (!user_id || !display_name) return json({ error: "user_id and display_name required" }, 400);
      await sql`UPDATE public.profiles SET display_name = ${display_name} WHERE user_id = ${user_id}::uuid`;
      return json({ success: true });
    }

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

    // START BREAK for an agent (manager-initiated)
    if (action === "start-break") {
      const { user_id, agent_name, break_type } = body;
      if (!user_id || !agent_name || !break_type) return json({ error: "user_id, agent_name, and break_type required" }, 400);
      const existing = await sql`SELECT id FROM public.active_breaks WHERE user_id = ${user_id}::uuid LIMIT 1`;
      if (existing.length > 0) return json({ error: "Agent is already on break" }, 400);
      const now = new Date().toISOString();
      await sql`INSERT INTO public.active_breaks (user_id, agent_name, break_type, start_time) VALUES (${user_id}::uuid, ${agent_name}, ${break_type}, ${now}::timestamptz)`;
      return json({ success: true });
    }

    // END BREAK for an agent (manager-initiated)
    if (action === "end-break") {
      const { user_id } = body;
      if (!user_id) return json({ error: "user_id required" }, 400);
      const active = await sql`SELECT * FROM public.active_breaks WHERE user_id = ${user_id}::uuid LIMIT 1`;
      if (active.length === 0) return json({ error: "Agent is not on break" }, 400);
      const record = active[0];
      const now = new Date();
      const start = new Date(record.start_time);
      const duration = Math.floor((now.getTime() - start.getTime()) / 1000);
      const dateStr = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
      await sql`INSERT INTO public.break_sessions (user_id, agent_name, break_type, start_time, end_time, duration, date)
        VALUES (${user_id}::uuid, ${record.agent_name}, ${record.break_type}, ${record.start_time}::timestamptz, ${now.toISOString()}::timestamptz, ${duration}, ${dateStr}::date)`;
      await sql`DELETE FROM public.active_breaks WHERE user_id = ${user_id}::uuid`;
      return json({ success: true });
    }

    // ADD MANUAL BREAK SESSION
    if (action === "add-manual-break") {
      const { user_id, agent_name, break_type, duration_minutes } = body;
      if (!user_id || !agent_name || !break_type || !duration_minutes) return json({ error: "user_id, agent_name, break_type, and duration_minutes required" }, 400);
      const durationSecs = Math.round(Number(duration_minutes) * 60);
      const now = new Date();
      const endTime = now.toISOString();
      const startTime = new Date(now.getTime() - durationSecs * 1000).toISOString();
      const dateStr = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
      await sql`INSERT INTO public.break_sessions (user_id, agent_name, break_type, start_time, end_time, duration, date)
        VALUES (${user_id}::uuid, ${agent_name}, ${break_type}, ${startTime}::timestamptz, ${endTime}::timestamptz, ${durationSecs}, ${dateStr}::date)`;
      return json({ success: true });
    }

    return json({ error: "Invalid action" }, 400);
  } catch (err) {
    console.error("manage-agent error:", err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
