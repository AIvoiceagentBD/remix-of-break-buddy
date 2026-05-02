// Invoke Lovable Cloud edge functions while authenticating with the
// external Supabase project's user JWT (since auth + data live there).
import { supabase as extSupabase } from "@/lib/supabase";

const CLOUD_URL = import.meta.env.VITE_SUPABASE_URL as string;
const CLOUD_ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export async function invokeCloudFunction<T = unknown>(
  name: string,
  body: unknown,
): Promise<{ data: T | null; error: Error | null }> {
  try {
    const { data: { session } } = await extSupabase.auth.getSession();
    const jwt = session?.access_token ?? CLOUD_ANON;

    const res = await fetch(`${CLOUD_URL}/functions/v1/${name}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${jwt}`,
        "apikey": CLOUD_ANON,
      },
      body: JSON.stringify(body ?? {}),
    });

    const text = await res.text();
    let parsed: any = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { parsed = { raw: text }; }

    if (!res.ok) {
      const msg = parsed?.error || `Request failed (${res.status})`;
      return { data: null, error: new Error(msg) };
    }
    return { data: parsed as T, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
  }
}
