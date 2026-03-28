import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import postgres from "npm:postgres@3.4.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const dbUrl = Deno.env.get("SUPABASE_DB_URL")!;

const sql = postgres(dbUrl, {
  prepare: false,
  ssl: "require",
  max: 1,
  idle_timeout: 5,
  connect_timeout: 10,
});

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Unauthorized" }, 401);

  try {
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await callerClient.auth.getUser();
    if (userError || !user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json();
    const { action } = body;

    // REFRESH: get active break, today's sessions, active count, pending approval
    if (action === "refresh") {
      const { date } = body;
      const [active, sessions, allActive, pending] = await Promise.all([
        sql`SELECT break_type, start_time FROM public.active_breaks WHERE user_id = ${user.id}::uuid LIMIT 1`,
        sql`SELECT * FROM public.break_sessions WHERE user_id = ${user.id}::uuid AND date = ${date}::date ORDER BY start_time DESC`,
        sql`SELECT count(*)::int as cnt FROM public.active_breaks`,
        sql`SELECT * FROM public.break_approval_requests WHERE user_id = ${user.id}::uuid AND status = 'pending' LIMIT 1`,
      ]);
      return json({
        activeBreak: active[0] || null,
        sessions: sessions,
        activeBreakCount: allActive[0]?.cnt || 0,
        pendingApproval: pending[0] || null,
      });
    }

    // START BREAK
    if (action === "start") {
      const { break_type, agent_name } = body;
      
      // Check concurrent breaks
      const [countResult] = await sql`SELECT count(*)::int as cnt FROM public.active_breaks`;
      const count = countResult?.cnt || 0;

      if (count >= 3) {
        // Submit approval request
        await sql`INSERT INTO public.break_approval_requests (user_id, agent_name, break_type) VALUES (${user.id}::uuid, ${agent_name}, ${break_type})`;
        return json({ needsApproval: true, activeCount: count });
      }

      // Check if already on break
      const existing = await sql`SELECT id FROM public.active_breaks WHERE user_id = ${user.id}::uuid LIMIT 1`;
      if (existing.length > 0) return json({ error: "Already on break" }, 400);

      const now = new Date().toISOString();
      await sql`INSERT INTO public.active_breaks (user_id, agent_name, break_type, start_time) VALUES (${user.id}::uuid, ${agent_name}, ${break_type}, ${now}::timestamptz)`;
      return json({ success: true, start_time: now });
    }

    // END BREAK
    if (action === "end") {
      const { agent_name, date } = body;
      const active = await sql`SELECT * FROM public.active_breaks WHERE user_id = ${user.id}::uuid LIMIT 1`;
      if (active.length === 0) return json({ error: "Not on break" }, 400);

      const record = active[0];
      const now = new Date();
      const start = new Date(record.start_time);
      const duration = Math.floor((now.getTime() - start.getTime()) / 1000);

      await sql`INSERT INTO public.break_sessions (user_id, agent_name, break_type, start_time, end_time, duration, date)
        VALUES (${user.id}::uuid, ${agent_name || record.agent_name}, ${record.break_type}, ${record.start_time}::timestamptz, ${now.toISOString()}::timestamptz, ${duration}, ${date}::date)`;
      await sql`DELETE FROM public.active_breaks WHERE user_id = ${user.id}::uuid`;
      return json({ success: true, duration });
    }

    // APPROVE/REJECT REQUEST (manager only)
    if (action === "approve-request") {
      const { request_id, approved } = body;
      // Verify manager role
      const roleCheck = await sql`SELECT role FROM public.user_roles WHERE user_id = ${user.id}::uuid AND role = 'manager' LIMIT 1`;
      if (roleCheck.length === 0) return json({ error: "Not a manager" }, 403);

      const status = approved ? 'approved' : 'rejected';
      await sql`UPDATE public.break_approval_requests SET status = ${status}, resolved_at = now(), resolved_by = ${user.id}::uuid WHERE id = ${request_id}::uuid AND status = 'pending'`;

      // If approved, start the break for that agent
      if (approved) {
        const reqData = await sql`SELECT user_id, agent_name, break_type FROM public.break_approval_requests WHERE id = ${request_id}::uuid LIMIT 1`;
        if (reqData.length > 0) {
          const r = reqData[0];
          const existing = await sql`SELECT id FROM public.active_breaks WHERE user_id = ${r.user_id}::uuid LIMIT 1`;
          if (existing.length === 0) {
            const now = new Date().toISOString();
            await sql`INSERT INTO public.active_breaks (user_id, agent_name, break_type, start_time) VALUES (${r.user_id}::uuid, ${r.agent_name}, ${r.break_type}, ${now}::timestamptz)`;
          }
        }
      }
      return json({ success: true });
    }

    // CANCEL APPROVAL REQUEST
    if (action === "cancel-request") {
      const { request_id } = body;
      await sql`DELETE FROM public.break_approval_requests WHERE id = ${request_id}::uuid AND user_id = ${user.id}::uuid AND status = 'pending'`;
      return json({ success: true });
    }

    // RECORD LOGIN
    if (action === "record-login") {
      const { date } = body;
      await sql`INSERT INTO public.login_sessions (user_id, date, logged_in_at) VALUES (${user.id}::uuid, ${date}::date, now()) ON CONFLICT (user_id, date) DO UPDATE SET logged_in_at = now()`;
      return json({ success: true });
    }

    // MANAGER REFRESH: get all data for dashboard
    if (action === "manager-refresh") {
      const { date } = body;
      // Verify manager role
      const roleCheck = await sql`SELECT role FROM public.user_roles WHERE user_id = ${user.id}::uuid AND role = 'manager' LIMIT 1`;
      if (roleCheck.length === 0) return json({ error: "Not a manager" }, 403);

      const [activeBreaks, sessions, profiles, approvals, logins, agentRoles] = await Promise.all([
        sql`SELECT * FROM public.active_breaks`,
        sql`SELECT * FROM public.break_sessions WHERE date = ${date}::date`,
        sql`SELECT * FROM public.profiles`,
        sql`SELECT * FROM public.break_approval_requests WHERE status = 'pending'`,
        sql`SELECT user_id FROM public.login_sessions WHERE date = ${date}::date`,
        sql`SELECT user_id FROM public.user_roles WHERE role = 'agent'`,
      ]);
      return json({ activeBreaks, sessions, profiles, approvals, logins, agentRoles });
    }

    return json({ error: "Invalid action" }, 400);
  } catch (err) {
    console.error("break-action error:", err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
