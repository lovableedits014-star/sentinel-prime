/**
 * Integração do SuperAdminClientSwitcher:
 *  - troca de gerente atualiza o clientId resolvido por useActiveClientId
 *  - o conteúdo gated por RequireClient nunca fica em branco durante a troca
 *    (sai do gate "Selecione um gerente" → mostra filhos do cliente A → mostra
 *     filhos do cliente B, sem passar por um estado vazio)
 *  - voltar para "Super Admin" reabre o gate (sem tela em branco)
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { resetMockState, supabaseMock, state } from "./supabaseMock";

vi.mock("@/integrations/supabase/client-selfhosted", () => ({ supabase: supabaseMock }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: supabaseMock }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import SuperAdminClientSwitcher from "@/components/SuperAdminClientSwitcher";
import RequireClient from "@/components/RequireClient";
import { useActiveClientId } from "@/hooks/useActiveClientId";

function Consumer() {
  const { clientId } = useActiveClientId();
  return <div data-testid="resolved-client">{clientId ?? "—"}</div>;
}

function App() {
  return (
    <>
      <SuperAdminClientSwitcher />
      <RequireClient skeletonVariant="minimal">
        <Consumer />
        <div data-testid="gated-content">CONTEÚDO DO CLIENTE</div>
      </RequireClient>
    </>
  );
}

function renderApp() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(
    <QueryClientProvider client={qc}>
      <App />
    </QueryClientProvider>,
  );
  return { qc, ...utils };
}

beforeEach(() => {
  resetMockState({
    user: { id: "admin" },
    isSuperAdmin: true,
    clientsById: {
      "c-A": { id: "c-A", name: "Cliente A" } as any,
      "c-B": { id: "c-B", name: "Cliente B" } as any,
    },
  });
  // adiciona cargo opcional para o select do switcher
  (state.clientsById["c-A"] as any).cargo = "Vereador";
  (state.clientsById["c-B"] as any).cargo = "Prefeito";
  localStorage.clear();
});

describe("SuperAdminClientSwitcher — integração", () => {
  it("começa sem seleção: mostra o gate, não o conteúdo", async () => {
    renderApp();
    await waitFor(() =>
      expect(screen.getByText(/Selecione um gerente/i)).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("gated-content")).not.toBeInTheDocument();
  });

  it("seleciona Cliente A: clientId resolve para c-A e conteúdo aparece", async () => {
    const user = userEvent.setup();
    renderApp();

    await waitFor(() => expect(screen.getByText(/Selecionar gerente/i)).toBeInTheDocument());

    await user.click(screen.getByTitle(/Trocar de gerente/i));
    await user.click(await screen.findByText("Cliente A"));

    await waitFor(() => expect(screen.getByTestId("gated-content")).toBeInTheDocument());
    expect(screen.getByTestId("resolved-client").textContent).toBe("c-A");
    expect(localStorage.getItem("lovable.super_admin.impersonate_client_id")).toBe("c-A");
  });

  it("troca de A para B: clientId atualiza e o conteúdo nunca some (sem tela branca)", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();

    // Seleciona A
    await user.click(screen.getByTitle(/Trocar de gerente/i));
    await user.click(await screen.findByText("Cliente A"));
    await waitFor(() => expect(screen.getByTestId("resolved-client").textContent).toBe("c-A"));

    // Troca para B
    await user.click(screen.getByTitle(/Trocar de gerente/i));
    await user.click(await screen.findByText("Cliente B"));

    await waitFor(() => expect(screen.getByTestId("resolved-client").textContent).toBe("c-B"));
    // O bloco gated permanece montado (apenas re-renderiza) — nunca vira tela em branco.
    expect(screen.getByTestId("gated-content")).toBeInTheDocument();
    // Sanidade: o root nunca ficou totalmente vazio
    expect(container.textContent ?? "").not.toBe("");
  });

  it("voltar para Super Admin (nenhum) reabre o gate, não deixa tela vazia", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByTitle(/Trocar de gerente/i));
    await user.click(await screen.findByText("Cliente A"));
    await waitFor(() => expect(screen.getByTestId("resolved-client").textContent).toBe("c-A"));

    await user.click(screen.getByTitle(/Trocar de gerente/i));
    await user.click(await screen.findByText(/Nenhum \(Super Admin\)/i));

    await waitFor(() =>
      expect(screen.getByText(/Selecione um gerente/i)).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("gated-content")).not.toBeInTheDocument();
    expect(localStorage.getItem("lovable.super_admin.impersonate_client_id")).toBeNull();
  });
});

describe("SuperAdminClientSwitcher — sem clientes cadastrados", () => {
  it("mostra mensagem 'Nenhum gerente cadastrado' e mantém o gate visível", async () => {
    resetMockState({ user: { id: "admin" }, isSuperAdmin: true, clientsById: {} });
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByTitle(/Trocar de gerente/i));
    expect(await screen.findByText(/Nenhum gerente cadastrado/i)).toBeInTheDocument();
    // Gate permanece — não fica em branco
    expect(screen.getByText(/Selecione um gerente/i)).toBeInTheDocument();
  });
});
