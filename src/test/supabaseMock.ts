/**
 * Shared supabase client mock used by every test in this folder.
 * Each test customizes `__rpcResults`, `__tableResults`, and `__user` to
 * simulate different user types (owner / team_member / super admin / no link).
 */
import { vi } from "vitest";

export type MockState = {
  user: { id: string } | null;
  isSuperAdmin: boolean;
  clientsByUser: Record<string, { id: string; name: string } | null>;
  clientsById: Record<string, { id: string; name: string } | null>;
  teamMembersByUser: Record<string, { client_id: string } | null>;
};

export const state: MockState = {
  user: null,
  isSuperAdmin: false,
  clientsByUser: {},
  clientsById: {},
  teamMembersByUser: {},
};

export function resetMockState(patch: Partial<MockState> = {}) {
  state.user = patch.user ?? null;
  state.isSuperAdmin = patch.isSuperAdmin ?? false;
  state.clientsByUser = patch.clientsByUser ?? {};
  state.clientsById = patch.clientsById ?? {};
  state.teamMembersByUser = patch.teamMembersByUser ?? {};
}

function buildQuery(table: string) {
  // Capture filter values then resolve based on `state`.
  const filters: Record<string, any> = {};
  const api: any = {
    select: () => api,
    order: () => api,
    limit: () => api,
    eq: (col: string, val: any) => { filters[col] = val; return api; },
    maybeSingle: async () => {
      if (table === "clients") {
        if (filters.user_id) return { data: state.clientsByUser[filters.user_id] ?? null, error: null };
        if (filters.id) return { data: state.clientsById[filters.id] ?? null, error: null };
      }
      if (table === "team_members") {
        return { data: state.teamMembersByUser[filters.user_id] ?? null, error: null };
      }
      return { data: null, error: null };
    },
    then: (resolve: any) => {
      // For non-maybeSingle (used by SuperAdminClientSwitcher list).
      if (table === "clients" && !filters.id && !filters.user_id) {
        resolve({ data: Object.values(state.clientsById).filter(Boolean), error: null });
      } else {
        resolve({ data: [], error: null });
      }
    },
  };
  return api;
}

export const supabaseMock = {
  auth: {
    getUser: vi.fn(async () => ({ data: { user: state.user }, error: null })),
    onAuthStateChange: vi.fn(() => ({
      data: { subscription: { unsubscribe: () => {} } },
    })),
  },
  rpc: vi.fn(async (name: string) => {
    if (name === "is_super_admin") return { data: state.isSuperAdmin, error: null };
    return { data: null, error: null };
  }),
  from: vi.fn((table: string) => buildQuery(table)),
};
