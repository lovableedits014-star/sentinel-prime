/**
 * Cenário multi-tab:
 *  - Duas instâncias do app (cada uma com seu próprio QueryClient) — uma "Tab A"
 *    onde o usuário troca de gerente, e uma "Tab B" passiva observando.
 *  - Verifica que o evento `storage` disparado pela troca em A propaga para B,
 *    invalida a query ["active-client-id"] e o clientId sincroniza nas duas abas.
 *  - Verifica também que voltar para Super Admin sincroniza (sem deixar B com
 *    dados do gerente anterior — exatamente o bug que causaria "tela errada").
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { resetMockState, supabaseMock, state } from "./supabaseMock";

vi.mock("@/integrations/supabase/client-selfhosted", () => ({ supabase: supabaseMock }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: supabaseMock }));

import { useActiveClientId } from "@/hooks/useActiveClientId";
import {
  setImpersonatedClientId,
  IMPERSONATE_CLIENT_KEY,
} from "@/lib/resolveClientId";

function ClientIdView({ tag }: { tag: string }) {
  const { clientId, isLoading } = useActiveClientId();
  return (
    <div data-testid={`tab-${tag}`}>
      {isLoading ? "loading" : (clientId ?? "—")}
    </div>
  );
}

function mountTab(tag: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(
    <QueryClientProvider client={qc}>
      <ClientIdView tag={tag} />
    </QueryClientProvider>,
  );
  return { qc, ...utils };
}

/**
 * jsdom não dispara o evento `storage` automaticamente para o próprio window
 * que setou o item (mesmo comportamento dos navegadores). Esse helper simula
 * o que outra aba veria: muda localStorage e dispara o evento manualmente.
 */
function tabASwitchTo(newId: string | null) {
  const oldValue = localStorage.getItem(IMPERSONATE_CLIENT_KEY);
  setImpersonatedClientId(newId);
  const evt = new StorageEvent("storage", {
    key: IMPERSONATE_CLIENT_KEY,
    oldValue,
    newValue: newId,
    storageArea: localStorage,
  });
  window.dispatchEvent(evt);
}

beforeEach(() => {
  resetMockState({
    user: { id: "admin" },
    isSuperAdmin: true,
    clientsById: {
      "c-A": { id: "c-A", name: "A" },
      "c-B": { id: "c-B", name: "B" },
    },
  });
  localStorage.clear();
});

describe("Sincronização cross-tab via storage event", () => {
  it("Tab B recebe a troca feita pela Tab A e sincroniza o clientId", async () => {
    // Tab A já começa com c-A selecionado (cenário: usuário escolheu antes de abrir B)
    setImpersonatedClientId("c-A");
    const tabA = mountTab("A");
    const tabB = mountTab("B");

    await waitFor(() => {
      expect(screen.getByTestId("tab-A").textContent).toBe("c-A");
      expect(screen.getByTestId("tab-B").textContent).toBe("c-A");
    });

    // Tab A troca para c-B → simula o storage event que B recebe
    await act(async () => {
      tabASwitchTo("c-B");
    });

    await waitFor(() => {
      expect(screen.getByTestId("tab-B").textContent).toBe("c-B");
    });

    tabA.unmount();
    tabB.unmount();
  });

  it("voltar para Super Admin (null) sincroniza B (não fica com gerente antigo)", async () => {
    setImpersonatedClientId("c-A");
    mountTab("A");
    mountTab("B");

    await waitFor(() => expect(screen.getByTestId("tab-B").textContent).toBe("c-A"));

    await act(async () => {
      tabASwitchTo(null);
    });

    await waitFor(() => expect(screen.getByTestId("tab-B").textContent).toBe("—"));
    expect(screen.getByTestId("tab-A").textContent).toBe("—");
  });

  it("ignora eventos storage de outras chaves (não derruba cache sem motivo)", async () => {
    setImpersonatedClientId("c-A");
    mountTab("B");
    await waitFor(() => expect(screen.getByTestId("tab-B").textContent).toBe("c-A"));

    const fetchCallsBefore = supabaseMock.auth.getUser.mock.calls.length;

    await act(async () => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "some-other-key",
          oldValue: "x",
          newValue: "y",
          storageArea: localStorage,
        }),
      );
    });

    // Nenhuma refetch dispara
    expect(supabaseMock.auth.getUser.mock.calls.length).toBe(fetchCallsBefore);
    expect(screen.getByTestId("tab-B").textContent).toBe("c-A");
  });

  it("dados sincronizados após múltiplas trocas seguidas (A→B→A)", async () => {
    setImpersonatedClientId("c-A");
    mountTab("A");
    mountTab("B");
    await waitFor(() => expect(screen.getByTestId("tab-B").textContent).toBe("c-A"));

    await act(async () => { tabASwitchTo("c-B"); });
    await waitFor(() => expect(screen.getByTestId("tab-B").textContent).toBe("c-B"));

    await act(async () => { tabASwitchTo("c-A"); });
    await waitFor(() => expect(screen.getByTestId("tab-B").textContent).toBe("c-A"));

    // Ambas alinhadas no final
    expect(screen.getByTestId("tab-A").textContent).toBe("c-A");
    expect(screen.getByTestId("tab-B").textContent).toBe("c-A");
  });
});
