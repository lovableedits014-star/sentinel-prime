/**
 * Cobre o resolvedor central de client_id para os 4 perfis de usuário:
 * - dono (clients.user_id)
 * - team_member ativo
 * - super admin (sem impersonação)
 * - super admin impersonando um cliente
 * - sem vínculo nenhum
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { resetMockState, state, supabaseMock } from "./supabaseMock";

vi.mock("@/integrations/supabase/client-selfhosted", () => ({ supabase: supabaseMock }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: supabaseMock }));

import {
  resolveClientId,
  getImpersonatedClientId,
  setImpersonatedClientId,
  IMPERSONATE_CLIENT_KEY,
} from "@/lib/resolveClientId";

beforeEach(() => {
  resetMockState();
  localStorage.clear();
});

describe("resolveClientId", () => {
  it("retorna null quando não há sessão", async () => {
    expect(await resolveClientId()).toBeNull();
  });

  it("usa clients.user_id quando o usuário é dono", async () => {
    resetMockState({
      user: { id: "u1" },
      clientsByUser: { u1: { id: "c-owner", name: "Owner" } },
    });
    expect(await resolveClientId()).toBe("c-owner");
  });

  it("cai em team_members.client_id quando não é dono", async () => {
    resetMockState({
      user: { id: "u2" },
      teamMembersByUser: { u2: { client_id: "c-team" } },
    });
    expect(await resolveClientId()).toBe("c-team");
  });

  it("super admin sem impersonação retorna seu próprio cliente (se houver) ou null", async () => {
    resetMockState({ user: { id: "admin" }, isSuperAdmin: true });
    expect(await resolveClientId()).toBeNull();
  });

  it("super admin impersonando retorna o cliente alvo", async () => {
    resetMockState({
      user: { id: "admin" },
      isSuperAdmin: true,
      clientsById: { "c-target": { id: "c-target", name: "Alvo" } },
    });
    setImpersonatedClientId("c-target");
    expect(getImpersonatedClientId()).toBe("c-target");
    expect(await resolveClientId()).toBe("c-target");
  });

  it("super admin com impersonação inválida cai no fallback", async () => {
    resetMockState({
      user: { id: "admin" },
      isSuperAdmin: true,
      clientsByUser: { admin: { id: "c-admin", name: "Admin Próprio" } },
    });
    localStorage.setItem(IMPERSONATE_CLIENT_KEY, "c-inexistente");
    // ID inválido (clientsById vazio para esse id) → ignora e usa o próprio
    expect(await resolveClientId()).toBe("c-admin");
  });

  it("usuário sem vínculo nenhum retorna null", async () => {
    resetMockState({ user: { id: "lonely" } });
    expect(await resolveClientId()).toBeNull();
  });
});
