import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import postgres from "https://deno.land/x/postgresjs@v3.4.4/mod.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const dbUrl = Deno.env.get("EXT_SUPABASE_DB_URL")!;
    const sql = postgres(dbUrl, { ssl: "require", max: 1 });

    // Add lead_admin to enum if missing (must be its own statement, not in tx)
    await sql.unsafe(`ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'lead_admin'`);

    // Ensure accountability_cases table exists
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS public.accountability_cases (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        agent_id uuid NOT NULL,
        agent_name text NOT NULL,
        reason text NOT NULL,
        amount numeric NOT NULL DEFAULT 0,
        call_id text,
        proof_link text,
        notes text,
        status text NOT NULL DEFAULT 'pending',
        submitted_by uuid NOT NULL,
        submitted_by_name text NOT NULL,
        approved_by uuid,
        manager_notes text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      ALTER TABLE public.accountability_cases ENABLE ROW LEVEL SECURITY;
    `);

    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS public.audit_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        case_id uuid NOT NULL,
        action text NOT NULL,
        performed_by uuid NOT NULL,
        performed_by_name text NOT NULL,
        details jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
    `);

    // Drop and recreate policies (idempotent)
    await sql.unsafe(`
      DROP POLICY IF EXISTS "Read own or all if staff" ON public.accountability_cases;
      DROP POLICY IF EXISTS "Staff can insert cases" ON public.accountability_cases;
      DROP POLICY IF EXISTS "Managers can update cases (not own submissions)" ON public.accountability_cases;
      DROP POLICY IF EXISTS "Staff can read audit logs" ON public.audit_logs;
      DROP POLICY IF EXISTS "Authenticated can insert audit logs" ON public.audit_logs;
    `);

    await sql.unsafe(`
      CREATE POLICY "Read own or all if staff" ON public.accountability_cases
        FOR SELECT TO authenticated
        USING (auth.uid() = agent_id OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'lead_admin'));

      CREATE POLICY "Staff can insert cases" ON public.accountability_cases
        FOR INSERT TO authenticated
        WITH CHECK ((public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'lead_admin')) AND submitted_by = auth.uid());

      CREATE POLICY "Managers can update cases (not own submissions)" ON public.accountability_cases
        FOR UPDATE TO authenticated
        USING (public.has_role(auth.uid(), 'manager') AND submitted_by <> auth.uid());

      CREATE POLICY "Staff can read audit logs" ON public.audit_logs
        FOR SELECT TO authenticated
        USING (public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'lead_admin'));

      CREATE POLICY "Authenticated can insert audit logs" ON public.audit_logs
        FOR INSERT TO authenticated
        WITH CHECK (performed_by = auth.uid());
    `);

    await sql.end();
    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
