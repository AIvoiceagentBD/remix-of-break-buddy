import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = Deno.env.get("EXT_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL")!;
    const key = Deno.env.get("EXT_SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, key);

    const results: Record<string, unknown> = {};

    // 1. Find ALL existing manager + lead_admin users
    const { data: roleRows } = await admin
      .from("user_roles")
      .select("user_id, role")
      .in("role", ["manager", "lead_admin"]);

    const staffIds = Array.from(new Set((roleRows ?? []).map((r) => r.user_id as string)));
    results.removingUserIds = staffIds;

    // 2. Delete role rows + profiles + auth users
    for (const uid of staffIds) {
      await admin.from("user_roles").delete().eq("user_id", uid);
      await admin.from("profiles").delete().eq("user_id", uid);
      await admin.auth.admin.deleteUser(uid).catch(() => {});
    }

    // Also remove by email in case orphan auth user exists
    const targetEmails = ["leadadmin@acecorp.com", "management@acecorp.com", "manager@lgm.com", "leadadmin@lgm.com"];
    const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
    for (const u of list?.users ?? []) {
      if (u.email && targetEmails.includes(u.email.toLowerCase())) {
        await admin.from("user_roles").delete().eq("user_id", u.id);
        await admin.from("profiles").delete().eq("user_id", u.id);
        await admin.auth.admin.deleteUser(u.id).catch(() => {});
      }
    }

    // 3. Create fresh accounts
    const accounts = [
      { email: "leadadmin@acecorp.com", password: "Lead@admin@321", name: "Lead Admin", role: "lead_admin" as const },
      { email: "management@acecorp.com", password: "Management@$!974", name: "Management", role: "manager" as const },
    ];

    const created: unknown[] = [];
    for (const acc of accounts) {
      const { data: newUser, error: createErr } = await admin.auth.admin.createUser({
        email: acc.email,
        password: acc.password,
        email_confirm: true,
        user_metadata: { display_name: acc.name },
      });
      if (createErr || !newUser.user) {
        created.push({ email: acc.email, error: createErr?.message });
        continue;
      }
      const uid = newUser.user.id;
      await admin.from("profiles").upsert({ user_id: uid, display_name: acc.name }, { onConflict: "user_id" });
      const { error: roleErr } = await admin.from("user_roles").insert({ user_id: uid, role: acc.role });
      created.push({ email: acc.email, user_id: uid, role: acc.role, roleErr: roleErr?.message });
    }

    results.created = created;
    return new Response(JSON.stringify({ success: true, ...results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
