# Regiões dinâmicas em Eleição (Campo Grande)

Hoje as 8 regiões (Centro, Segredo, Prosa, Bandeira, Anhanduizinho, Lagoa, Imbirussu, Moreninha) estão **hardcoded em 3 lugares**:

- `src/pages/Eleicao.tsx` — `REGIOES` + tipo `Regiao` (filtros, formulário do líder, listas)
- `src/components/eleicao/EleicaoConfigPanel.tsx` — `REGIOES` (links de grupos por região)
- `supabase/functions/eleicao-notify-novo-lider/index.ts` — `REGIAO_LABELS` (rótulo na mensagem)

Para o usuário poder **adicionar novas regiões a qualquer momento** (hoje quer +1, amanhã pode querer mais), a única solução limpa é mover essa lista para o banco e usá-la em todos os pontos.

## 1. Banco — nova tabela `eleicao_regioes`

Migration:

```sql
create table public.eleicao_regioes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  value text not null,        -- slug minúsculo, ex: "centro", "novo_horizonte"
  label text not null,        -- rótulo amigável, ex: "Centro"
  ordem int not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  unique (client_id, value)
);

alter table public.eleicao_regioes enable row level security;

-- policies: leitura por membros do client; escrita por owner/super-admin
-- (mesmo padrão usado em outras tabelas client-scoped do projeto)
```

**Seed automático** das 8 regiões existentes para cada `client_id` que já tem líderes cadastrados, preservando os `value` atuais (`centro`, `segredo`, …) — assim nenhum líder fica órfão.

## 2. Hook compartilhado `useRegioesEleicao(clientId)`

Novo arquivo `src/hooks/useRegioesEleicao.ts`:

- `data: { value, label, ordem }[]` ordenado por `ordem, label`
- `add({ label })` — gera `value` a partir do label (slug `lowercase`, sem acento, `_` no espaço), insere com `ordem = max+1`
- `rename`, `remove`, `reorder` (opcional, fora do escopo desta entrega — só `add` agora)
- React Query, invalida ao mutar

## 3. UI — `EleicaoConfigPanel.tsx`

No card "Links dos grupos por região":

- Substituir `REGIOES` constante pelo hook
- Listar regiões dinamicamente; manter input de link por região (já salva em `grupos_links` JSON, que é flexível — nenhuma migração necessária)
- Adicionar **botão "+ Nova região"** que abre um pequeno form inline (input do nome) e chama `add({ label })`
- Layout responsivo: trocar `grid-cols-[140px_1fr]` por `flex flex-col sm:grid sm:grid-cols-[160px_1fr] gap-2` para empilhar no mobile
- Botão de remover região (ícone X) ao lado de cada linha — só permite remover se não houver líder cadastrado naquela região (checa `pessoas_eleicao` antes; se houver, mostra toast explicando)

## 4. UI — `src/pages/Eleicao.tsx`

- Remover constante `REGIOES` e tipo literal `Regiao`; passar a usar `string` para `regiao`
- Consumir `useRegioesEleicao(clientId)` em:
  - filtro de região (linha ~382)
  - render dos cards por região (linha ~544)
  - select do formulário de cadastro de líder (linha ~680)
  - lookup de label (linha ~1027)
- Estado inicial do form: primeira região retornada pelo hook (em vez de `"centro"` fixo)
- Garantir grids responsivos dos cards de região (já são `grid-cols-1 md:grid-cols-2 lg:grid-cols-4` — confirmar e ajustar se necessário para 1067px)

## 5. Edge Function `eleicao-notify-novo-lider`

- Remover `REGIAO_LABELS` hardcoded
- Buscar o label da região no banco: `select label from eleicao_regioes where client_id = ? and value = ?`
- Fallback: se não encontrar, usa o próprio `value` capitalizado (não quebra envios)
- O `link_grupo` continua vindo de `eleicao_notif_config.grupos_links[regiao]` (já é dinâmico)

## 6. Responsividade (revisão geral)

Viewport atual do usuário é 1067px. Verificar e ajustar:

- `EleicaoConfigPanel`: cards com padding consistente, inputs `w-full`, grid de regiões empilha no `< sm`
- `Eleicao.tsx`: header de filtros com `flex-wrap`, cards de região em grid responsivo, tabelas com `overflow-x-auto` no mobile
- Botão "Nova região": `w-full sm:w-auto`

## Fora do escopo (para evitar regressão)

- Não mexer em `pessoas_eleicao.regiao` (continua text livre)
- Não mexer em outros módulos que usam o conceito "região" para outras coisas (inteligência eleitoral usa zona TSE, é independente)
- Reordenação drag-and-drop e renomear ficam para iteração futura

---

**Resultado esperado:** o gerente abre `Configurações > Eleição`, clica em "+ Nova região", digita o nome (ex.: "Novo Horizonte"), e ela passa a aparecer em todos os selects, no card de líderes da página Eleição, e nas mensagens de WhatsApp — com link de grupo configurável e tudo responsivo no mobile.
