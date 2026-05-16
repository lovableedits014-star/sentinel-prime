/**
 * Garante que nenhuma tela fica vazia: RequireClient sempre renderiza algo
 * — um gate apropriado para cada perfil — em vez de devolver null.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { resetMockState, supabaseMock } from "./supabaseMock";

vi.mock("@/integrations/supabase/client-selfhosted", () => ({ supabase: supabaseMock }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: supabaseMock }));

import RequireClient from "@/components/RequireClient";
import { setImpersonatedClientId } from "@/lib/resolveClientId";

function renderWithClient(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    React.createElement(QueryClientProvider, { client: qc }, ui)
  );
}

beforeEach(() => {
  resetMockState();
  localStorage.clear();
});

describe("RequireClient — gates por perfil", () => {
  it("dono: renderiza os filhos", async () => {
    resetMockState({
      user: { id: "u1" },
      clientsByUser: { u1: { id: "c1", name: "X" } },
    });
    renderWithClient(
      React.createElement(RequireClient, null, React.createElement("div", null, "CONTEUDO"))
    );
    await waitFor(() => expect(screen.getByText("CONTEUDO")).toBeInTheDocument());
  });

  it("team_member: renderiza os filhos", async () => {
    resetMockState({
      user: { id: "u2" },
      teamMembersByUser: { u2: { client_id: "c2" } },
    });
    renderWithClient(
      React.createElement(RequireClient, null, React.createElement("div", null, "CONTEUDO"))
    );
    await waitFor(() => expect(screen.getByText("CONTEUDO")).toBeInTheDocument());
  });

  it("super admin sem seleção: mostra 'Selecione um gerente' (não tela vazia)", async () => {
    resetMockState({ user: { id: "admin" }, isSuperAdmin: true });
    renderWithClient(
      React.createElement(RequireClient, null, React.createElement("div", null, "CONTEUDO"))
    );
    await waitFor(() =>
      expect(screen.getByText(/Selecione um gerente/i)).toBeInTheDocument()
    );
    expect(screen.queryByText("CONTEUDO")).not.toBeInTheDocument();
  });

  it("super admin impersonando: renderiza os filhos", async () => {
    resetMockState({
      user: { id: "admin" },
      isSuperAdmin: true,
      clientsById: { "c-x": { id: "c-x", name: "X" } },
    });
    setImpersonatedClientId("c-x");
    renderWithClient(
      React.createElement(RequireClient, null, React.createElement("div", null, "CONTEUDO"))
    );
    await waitFor(() => expect(screen.getByText("CONTEUDO")).toBeInTheDocument());
  });

  it("usuário sem vínculo: mostra 'Sem vínculo ativo' (não tela vazia)", async () => {
    resetMockState({ user: { id: "ghost" } });
    renderWithClient(
      React.createElement(RequireClient, null, React.createElement("div", null, "CONTEUDO"))
    );
    await waitFor(() =>
      expect(screen.getByText(/Sem vínculo ativo/i)).toBeInTheDocument()
    );
    expect(screen.queryByText("CONTEUDO")).not.toBeInTheDocument();
  });
});
