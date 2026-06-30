## Objetivo

Garantir que coordenadores, líderes e cabos cadastrados como **Interior** tenham exatamente o mesmo comportamento das regiões de Campo Grande — só que apontando para o **Grupo Interior único** (`__interior__`) em vez de um grupo por região.

Hoje só a **mensagem de boas-vindas** está adaptada. O **rastreamento de entrada no grupo** (badges "entrou/pendente" na ficha, base da cobrança automática) ainda procura o JID por nome da cidade, então todo mundo do interior fica como `sem_grupo` mesmo com o grupo único configurado.

## Mudanças

### 1. Rastreamento de entrada — `supabase/functions/eleicao-check-grupo-membros`
- Incluir `escopo` no `select` de `eleicao_pessoas` e na subida via `parent_id` (resolveRegiao passa a devolver `{ regiao, escopo }`).
- Na hora de escolher o `groupJid` da pessoa: se `escopo === 'interior'`, usar `gruposJids['__interior__']`; senão, manter `gruposJids[regiao]` como hoje.
- O loop de sincronização de participantes não muda (já varre todas as entradas de `gruposJids`, inclusive `__interior__`).
- Resultado: pessoas do interior passam a aparecer como `entrou` / `pendente` corretamente, alimentando os mesmos painéis e a cobrança automática.

### 2. Boas-vindas — `supabase/functions/eleicao-notify-novo-lider` e `src/lib/eleicao-fluxo-cadastro.ts`
- Hoje o fallback `escopo === 'interior'` já existe para coordenador/líder. Garantir que **cabo eleitoral** do interior também receba o link do grupo único (mesma regra para os 3 tipos).
- Sem mudança de template — só assegurar que o `{link_grupo}` resolvido seja o do `__interior__` quando aplicável.

### 3. UI — `EleicaoConfigPanel.tsx`
- Acrescentar um aviso curto abaixo do card "🌾 Grupo Interior" explicando que o JID configurado ali é o que define quem do interior aparece como "entrou no grupo" (paridade com os cards das regiões).
- Nenhuma mudança estrutural; campos já existem.

## Detalhes técnicos

- A tabela `eleicao_pessoa_grupo_status` continua sendo a fonte de verdade; só muda como o `groupJid` esperado é resolvido por pessoa.
- `escopo` é lido da própria pessoa; se nulo, herda do ancestral (mesma lógica atual da região).
- Sem migração nem mudança de schema.
- Deploy das duas edge functions após a alteração.

## Fora de escopo

- Criar lembretes/cobranças novos — vamos reusar o fluxo de cobrança existente, que passa a funcionar para o interior automaticamente assim que o rastreamento começar a marcar `entrou/pendente` corretamente.
