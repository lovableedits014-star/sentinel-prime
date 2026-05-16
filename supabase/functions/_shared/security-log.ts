// Helper para registrar eventos de auditoria em `public.security_events`.
//
// Uso típico dentro de uma Edge Function (com supabase admin client):
//
//   import { logSecurityEvent } from "../_shared/security-log.ts";
//   await logSecurityEvent(admin, {
//     event_type: "role_changed",
//     user_id: caller.id,
//     target_user_id: targetId,
//     client_id,
//     metadata: { from: "member", to: "manager" },
//   });
//
// NUNCA bloqueia o request principal: erros são apenas logados.
// A tabela tem RLS deny-all exceto super_admin SELECT; INSERT via service role.

type Client = { from: (t: string) => { insert: (rows: unknown) => Promise<{ error: unknown }> } };

export interface SecurityEventInput {
  event_type: string;
  user_id?: string | null;
  target_user_id?: string | null;
  client_id?: string | null;
  metadata?: Record<string, unknown>;
  ip_address?: string | null;
  user_agent?: string | null;
}

export async function logSecurityEvent(
  admin: Client,
  evt: SecurityEventInput,
): Promise<void> {
  try {
    const { error } = await admin.from("security_events").insert({
      event_type: evt.event_type,
      user_id: evt.user_id ?? null,
      target_user_id: evt.target_user_id ?? null,
      client_id: evt.client_id ?? null,
      metadata: evt.metadata ?? {},
      ip_address: evt.ip_address ?? null,
      user_agent: evt.user_agent ?? null,
    });
    if (error) {
      console.warn("[security-log] insert failed:", error);
    }
  } catch (e) {
    console.warn("[security-log] insert exception:", (e as Error)?.message);
  }
}

export function extractRequestMeta(req: Request) {
  return {
    ip_address:
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      null,
    user_agent: req.headers.get("user-agent") || null,
  };
}
