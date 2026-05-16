/**
 * Garante que a troca de gerente:
 *  - Invalida o cache da chave ["active-client-id"] (e por consequência todas as
 *    queries derivadas de clientId).
 *  - useActiveClientId expõe os flags certos por perfil (super admin, precisa
 *    selecionar gerente, impersonando, vínculo normal).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { resetMockState, supabaseMock } from "./supabaseMock";

vi.mock("@/integrations/supabase/client-selfhosted", () => ({ supabase: supabaseMock }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: supabaseMock }));

import {
  useActiveClientId,
  ACTIVE_CLIENT_QUERY_KEY,
} from "@/hooks/useActiveClientId";
import { setImpersonatedClientId } from "@/lib/resolveClientId";

function wrapperWithClient() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
  return { qc, Wrapper };
}

beforeEach(() => {
  resetMockState();
  localStorage.clear();
});

describe("useActiveClientId — perfis", () => {
  it("dono: retorna seu clientId e isSuperAdmin=false", async () => {
    resetMockState({
      user: { id: "u1" },
      clientsByUser: { u1: { id: "c-owner", name: "X" } },
    });
    const { Wrapper } = wrapperWithClient();
    const { result } = renderHook(() => useActiveClientId(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.clientId).toBe("c-owner");
    expect(result.current.isSuperAdmin).toBe(false);
    expect(result.current.needsClientSelection).toBe(false);
  });

  it("team_member: resolve via team_members", async () => {
    resetMockState({
      user: { id: "u2" },
      teamMembersByUser: { u2: { client_id: "c-team" } },
    });
    const { Wrapper } = wrapperWithClient();
    const { result } = renderHook(() => useActiveClientId(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.clientId).toBe("c-team"));
    expect(result.current.needsClientSelection).toBe(false);
  });

  it("super admin sem seleção: needsClientSelection=true (gate aparece, sem tela vazia)", async () => {
    resetMockState({ user: { id: "admin" }, isSuperAdmin: true });
    const { Wrapper } = wrapperWithClient();
    const { result } = renderHook(() => useActiveClientId(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.clientId).toBeNull();
    expect(result.current.isSuperAdmin).toBe(true);
    expect(result.current.needsClientSelection).toBe(true);
  });

  it("super admin impersonando: retorna o cliente alvo e isImpersonating=true", async () => {
    resetMockState({
      user: { id: "admin" },
      isSuperAdmin: true,
      clientsById: { "c-target": { id: "c-target", name: "Alvo" } },
    });
    setImpersonatedClientId("c-target");
    const { Wrapper } = wrapperWithClient();
    const { result } = renderHook(() => useActiveClientId(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.clientId).toBe("c-target"));
    expect(result.current.isImpersonating).toBe(true);
    expect(result.current.needsClientSelection).toBe(false);
  });
});

describe("useActiveClientId — troca de gerente invalida o cache", () => {
  it("invalidateQueries(['active-client-id']) força refetch com o novo cliente", async () => {
    resetMockState({
      user: { id: "admin" },
      isSuperAdmin: true,
      clientsById: {
        "c-A": { id: "c-A", name: "A" },
        "c-B": { id: "c-B", name: "B" },
      },
    });
    setImpersonatedClientId("c-A");

    const { qc, Wrapper } = wrapperWithClient();
    const { result } = renderHook(() => useActiveClientId(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.clientId).toBe("c-A"));

    // Simula o switcher: troca localStorage e invalida o cache.
    await act(async () => {
      setImpersonatedClientId("c-B");
      await qc.invalidateQueries({ queryKey: ACTIVE_CLIENT_QUERY_KEY });
    });

    await waitFor(() => expect(result.current.clientId).toBe("c-B"));
    expect(result.current.isImpersonating).toBe(true);
  });

  it("invalidateQueries() sem chave (botão do switcher) também refetcha", async () => {
    resetMockState({
      user: { id: "admin" },
      isSuperAdmin: true,
      clientsById: { "c-A": { id: "c-A", name: "A" }, "c-B": { id: "c-B", name: "B" } },
    });
    setImpersonatedClientId("c-A");

    const { qc, Wrapper } = wrapperWithClient();
    const { result } = renderHook(() => useActiveClientId(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.clientId).toBe("c-A"));

    await act(async () => {
      setImpersonatedClientId("c-B");
      await qc.invalidateQueries(); // exatamente o que o SuperAdminClientSwitcher faz
    });

    await waitFor(() => expect(result.current.clientId).toBe("c-B"));
  });
});
