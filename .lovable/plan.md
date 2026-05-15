## Diagnóstico

O **gerente** (registro em `team_members` com `is_manager = true`) já está com acesso liberado à navegação para `/settings` — o `DashboardLayout` trata `is_manager` como acesso total. O problema está dentro da própria página `src/pages/Settings.tsx`:

```ts
// Settings.tsx (atual)
const { data } = await supabase
  .from("clients")
  .select("id, name")
  .eq("user_id", user.id)   // ← só encontra o DONO do cliente
  .limit(1).maybeSingle();
if (data) setClientId(data.id);
```

Como o gerente não é dono do cliente (apenas membro da equipe), `clientId` fica vazio e **todos os cards são renderizados condicionalmente com `{clientId && ...}`**, então a aba de Configurações aparece em branco para ele — inclusive o `TeamUsersPanel`, que é exatamente onde ele cadastraria os usuários do sistema dele.

Esse mesmo bug já foi corrigido em `Comments.tsx` e `Integrations.tsx` usando o helper `resolveClientId()` (que faz fallback de `clients` → `team_members`). O `Settings.tsx` ficou de fora.

## Onde o gerente cadastra os usuários

O cadastro existe e está correto: é o componente `TeamUsersPanel` (botão "Adicionar usuário" → chama a edge function `create-team-user`). Ele aparece dentro de `/settings`, logo abaixo das outras configurações. O motivo de "não encontrar" é o mesmo bug acima — o painel não está sendo montado porque `clientId` está vazio para o gerente.

## Correção

Trocar a resolução de `clientId` no `Settings.tsx` para usar `resolveClientId()`:

```ts
import { resolveClientId } from "@/lib/resolveClientId";

useEffect(() => {
  (async () => {
    const id = await resolveClientId();
    if (id) setClientId(id);
    setLoading(false);
  })();
}, []);
```

Resultado: para o gerente, `resolveClientId` cai no fallback de `team_members` (status `active`), retorna o `client_id` ao qual ele pertence, e todos os cards de Configurações passam a renderizar — incluindo o **TeamUsersPanel**, onde ele cria os usuários da equipe dele.

## Escopo

- **1 arquivo alterado:** `src/pages/Settings.tsx` (somente o `useEffect` de resolução de cliente).
- Sem mudanças no banco, sem mudanças em edge functions, sem mudanças no menu/layout.
- Não mexe em business logic — apenas corrige a fonte do `clientId` que já é usada por todos os cards da página.

## Verificação

Após a alteração, logado como gerente em `/settings`:
1. Os cards (WhatsApp, Identidade, Integrações, **Equipe / Usuários**) devem aparecer.
2. No card "Usuários da Equipe", o botão "Adicionar usuário" abre o diálogo e o cadastro deve funcionar (a edge `create-team-user` já está deployada e usa o mesmo `client_id`).