## Objetivo

Hoje, quando um novo líder é cadastrado, o sistema escolhe o **coordenador mais antigo** da região como destinatário da mensagem (`order created_at asc limit 1`). Como cada região vai passar a ter vários coordenadores, isso é frágil.

A proposta é permitir marcar **um coordenador favorito por região**. Esse é o único que recebe a notificação de novos líderes daquela região. Os demais continuam cadastrados normalmente, com todos os outros recursos (contrato, link de acesso, gestão de equipe, disparos genéricos, etc.) — só não recebem essa notificação específica.

## O que muda

### 1. Banco
- Nova coluna em `eleicao_pessoas`:
  - `is_favorito_regiao boolean default false`
- **Índice único parcial** garantindo no máximo 1 favorito por região, por cliente:
  - `unique (client_id, escopo, regiao) where tipo = 'coordenador' and is_favorito_regiao = true`
- **Auto-favorito**: trigger `before insert` em coordenador — se for o primeiro coordenador da região (nenhum outro existe), marca automaticamente como favorito. Assim, regiões com 1 só coordenador continuam funcionando sem clique manual.

### 2. Edge function `eleicao-notify-novo-lider`
A função `resolveCoord` passa a usar esta ordem de prioridade:
1. `parent_id` do líder, **se** for coordenador (mantém comportamento atual quando o cadastro define explicitamente o coordenador pai).
2. Coordenador da região com `is_favorito_regiao = true`.
3. Fallback: coordenador mais antigo da região (comportamento atual) — só usado se ninguém estiver marcado como favorito.

Os demais coordenadores **não recebem** essa mensagem específica (é justamente o que o favorito resolve), mas continuam aparecendo em qualquer outro disparo, listagem, etc.

### 3. UI — página Eleição (`src/pages/Eleicao.tsx`)
No card/linha de cada coordenador na árvore:
- Um **botão de estrela** (`Star` lucide-icon) ao lado do nome:
  - **Vazia** → coordenador comum. Clicar pergunta "Definir como favorito da região *Centro*?" e marca.
  - **Preenchida (amarela)** → favorito atual. Clicar desmarca (com confirmação).
- Ao marcar um novo favorito, o anterior da mesma região é desmarcado automaticamente (a UI faz `update ... is_favorito_regiao=false` no antigo e `true` no novo, em uma transação simples — o índice único garante consistência).
- Badge sutil "★ Favorito da região" no nome quando ativo, para ficar visível na árvore.

### 4. Tooltip explicativo
Pequeno texto/info-icon perto do filtro de coordenadores ou no painel de configurações de notificação:
> "O coordenador favorito de cada região é quem recebe a notificação automática quando um novo líder é cadastrado naquela região. Os demais coordenadores seguem ativos no sistema normalmente."

## Detalhes técnicos

```sql
-- migration
alter table public.eleicao_pessoas
  add column if not exists is_favorito_regiao boolean not null default false;

create unique index if not exists eleicao_pessoas_um_favorito_por_regiao
  on public.eleicao_pessoas (client_id, escopo, regiao)
  where tipo = 'coordenador' and is_favorito_regiao = true;

-- trigger: 1º coordenador da região vira favorito automaticamente
create or replace function public.eleicao_auto_favorito_coord()
returns trigger language plpgsql as $$
begin
  if NEW.tipo = 'coordenador' and NEW.is_favorito_regiao = false then
    if not exists (
      select 1 from public.eleicao_pessoas
      where client_id = NEW.client_id and tipo = 'coordenador'
        and escopo = NEW.escopo and regiao is not distinct from NEW.regiao
    ) then
      NEW.is_favorito_regiao := true;
    end if;
  end if;
  return NEW;
end$$;

drop trigger if exists trg_eleicao_auto_favorito_coord on public.eleicao_pessoas;
create trigger trg_eleicao_auto_favorito_coord
  before insert on public.eleicao_pessoas
  for each row execute function public.eleicao_auto_favorito_coord();
```

Backfill (executado uma vez na migration): para cada `(client_id, escopo, regiao)` com coordenadores existentes e nenhum favorito, marca o coordenador mais antigo como favorito — assim o comportamento permanece idêntico ao atual no dia em que o recurso entrar.

Edge function — substituir o segundo bloco do `resolveCoord` por:
```ts
// 2. tenta favorito
const { data: fav } = await admin.from("eleicao_pessoas")
  .select("nome, telefone")
  .eq("client_id", pessoa.client_id).eq("tipo", "coordenador")
  .eq("escopo", pessoa.escopo).eq("regiao", pessoa.regiao)
  .eq("is_favorito_regiao", true).maybeSingle();
if (fav?.telefone) return { phone: fav.telefone, nome: fav.nome };

// 3. fallback: mais antigo (comportamento legado)
```

## Confirmação de escopo

Interpretei a sua frase "os outros não devem ser ignorados no envio" como: **os coordenadores não-favoritos continuam ativos no sistema** (cadastro, contrato, equipe, disparos gerais), só não recebem essa notificação automática específica de novo líder. Se a intenção for diferente — por exemplo, mandar a mensagem para todos mas destacar o favorito — me avise antes de implementar.
