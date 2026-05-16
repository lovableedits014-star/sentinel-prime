import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { resolveClientId, getImpersonatedClientId } from "@/lib/resolveClientId";
import { logTelemetry } from "@/lib/client-telemetry";

export const ACTIVE_CLIENT_QUERY_KEY = ["active-client-id"] as const;

export interface ActiveClientInfo {
  clientId: string | null;
  isSuperAdmin: boolean;
  isImpersonating: boolean;
}

async function fetchActive(): Promise<ActiveClientInfo> {
  const started = performance.now();
  logTelemetry("resolve_started");
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      logTelemetry("resolve_finished", { clientId: null, reason: "no-user", ms: Math.round(performance.now() - started) });
      return { clientId: null, isSuperAdmin: false, isImpersonating: false };
    }

    let isSuperAdmin = false;
    try {
      const { data } = await supabase.rpc("is_super_admin");
      isSuperAdmin = data === true;
    } catch {}

    const clientId = await resolveClientId();
    const isImpersonating = isSuperAdmin && !!getImpersonatedClientId() && !!clientId;
    logTelemetry("resolve_finished", {
      clientId,
      isSuperAdmin,
      isImpersonating,
      userId: user.id,
      ms: Math.round(performance.now() - started),
    });
    return { clientId, isSuperAdmin, isImpersonating };
  } catch (e: any) {
    logTelemetry("resolve_error", { message: e?.message ?? String(e) });
    throw e;
  }
}

/**
 * Single source of truth for the active client_id in the UI.
 * - Honors super-admin impersonation via localStorage.
 * - Cached under one stable key so the SuperAdminClientSwitcher can
 *   invalidate the whole app without a page reload.
 *
 * Returns `data` (clientId) plus auxiliary flags. Most pages should also
 * gate their data queries with `enabled: !!clientId` and include `clientId`
 * in the React Query key.
 */
export function useActiveClientId() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ACTIVE_CLIENT_QUERY_KEY,
    queryFn: fetchActive,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });

  // Re-fetch when the auth user changes (login/logout/swap account).
  useEffect(() => {
    let lastUserId: string | null = null;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const uid = session?.user?.id ?? null;
      if (uid !== lastUserId) {
        logTelemetry("queries_invalidated", { reason: "auth_state_change", event, userId: uid });
        lastUserId = uid;
        qc.invalidateQueries({ queryKey: ACTIVE_CLIENT_QUERY_KEY });
      }
    });
    return () => subscription.unsubscribe();
  }, [qc]);

  const info = query.data;
  const clientId = info?.clientId ?? null;

  // Track clientId transitions (mount + any change) for debugging.
  const prevClientIdRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (query.isLoading) return;
    if (prevClientIdRef.current !== clientId) {
      logTelemetry("client_id_changed", {
        from: prevClientIdRef.current ?? null,
        to: clientId,
        isSuperAdmin: info?.isSuperAdmin ?? false,
        isImpersonating: info?.isImpersonating ?? false,
      });
      prevClientIdRef.current = clientId;
    }
  }, [clientId, info?.isSuperAdmin, info?.isImpersonating, query.isLoading]);

  return {
    ...query,
    clientId,
    isSuperAdmin: info?.isSuperAdmin ?? false,
    isImpersonating: info?.isImpersonating ?? false,
    needsClientSelection: !!info?.isSuperAdmin && !info?.clientId,
  };
}
