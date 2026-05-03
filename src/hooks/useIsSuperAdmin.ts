import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Server-side super-admin check via the SECURITY DEFINER `is_super_admin()` RPC.
 * Never trust the client session's email field for privileged UI gating.
 */
export function useIsSuperAdmin(): { isSuperAdmin: boolean; loading: boolean } {
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          if (!cancelled) { setIsSuperAdmin(false); setLoading(false); }
          return;
        }
        const { data, error } = await supabase.rpc("is_super_admin");
        if (cancelled) return;
        setIsSuperAdmin(!error && data === true);
      } catch {
        if (!cancelled) setIsSuperAdmin(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_e, session) => {
      if (!session?.user) { setIsSuperAdmin(false); return; }
      const { data, error } = await supabase.rpc("is_super_admin");
      setIsSuperAdmin(!error && data === true);
    });
    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, []);

  return { isSuperAdmin, loading };
}
