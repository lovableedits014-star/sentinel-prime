/**
 * Lightweight client-side telemetry for tracking active clientId changes
 * and React Query cache invalidations. Helps debug "blank screen" /
 * "stale data" bugs across the multi-tenant Super Admin impersonation flow.
 *
 * - All output goes to console (grouped, color-coded).
 * - Keeps an in-memory ring buffer of the last 100 events, exposed on
 *   `window.__clientTelemetry` so you can inspect history at any moment.
 * - Enable verbose logs by setting `localStorage.LV_DEBUG_CLIENT = "1"`
 *   (always on in dev mode).
 */

export type TelemetryEventType =
  | "client_id_changed"
  | "impersonation_set"
  | "impersonation_cleared"
  | "queries_invalidated"
  | "resolve_started"
  | "resolve_finished"
  | "resolve_error";

export interface TelemetryEvent {
  type: TelemetryEventType;
  at: string; // ISO timestamp
  payload?: Record<string, unknown>;
}

const MAX_EVENTS = 100;
const buffer: TelemetryEvent[] = [];

function isEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (import.meta.env?.DEV) return true;
    return window.localStorage.getItem("LV_DEBUG_CLIENT") === "1";
  } catch {
    return false;
  }
}

function colorFor(type: TelemetryEventType): string {
  switch (type) {
    case "client_id_changed": return "color:#10b981;font-weight:bold";
    case "impersonation_set": return "color:#f59e0b;font-weight:bold";
    case "impersonation_cleared": return "color:#f59e0b";
    case "queries_invalidated": return "color:#3b82f6";
    case "resolve_started": return "color:#6b7280";
    case "resolve_finished": return "color:#6b7280";
    case "resolve_error": return "color:#ef4444;font-weight:bold";
    default: return "color:inherit";
  }
}

export function logTelemetry(type: TelemetryEventType, payload?: Record<string, unknown>) {
  const evt: TelemetryEvent = { type, at: new Date().toISOString(), payload };
  buffer.push(evt);
  if (buffer.length > MAX_EVENTS) buffer.shift();

  if (typeof window !== "undefined") {
    (window as any).__clientTelemetry = {
      events: buffer,
      print: () => console.table(buffer.map(e => ({ at: e.at, type: e.type, ...(e.payload || {}) }))),
      clear: () => { buffer.length = 0; },
    };
  }

  if (!isEnabled()) return;
  // eslint-disable-next-line no-console
  console.log(`%c[client]%c ${type}`, colorFor(type), "color:inherit", payload ?? "");
}

export function getTelemetryBuffer(): readonly TelemetryEvent[] {
  return buffer;
}
