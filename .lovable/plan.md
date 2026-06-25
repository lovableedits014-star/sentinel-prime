## Problema

Hoje existe **um único "Prefixo de TAG"** salvo no `eleicao_distribuicao_template` (campo `tag_prefixo`) que é aplicado a TODOS os contatos de TODAS as regiões. Isso é uma tag "de campanha", não uma tag "da região" — exatamente o que você apontou.

O correto: cada **região** tem a sua própria TAG curta (ex: Moreninhas = `MOR`, Centro = `CEN`), e essa tag é que vai na frente do nome de cada contato no vCard, CSV e texto, para o coordenador identificar de onde o contato veio.

## Correção proposta

### 1. Banco — tag por região
- Adicionar coluna `tag text` em `public.eleicao_regioes` (curta, ex: 3–6 letras).
- Backfill: para cada região existente, gerar uma tag default a partir do `label` (primeiras letras maiúsculas sem acento, máx. 6 chars). Usuário pode editar depois.

### 2. UI — gestão da tag da região
- No `useRegioesEleicao` (e no painel onde regiões são cadastradas/listadas) expor o campo `tag` com input editável + botão salvar.
- Validação: tag obrigatória, máx. 8 chars, sem espaços, uppercase automático.

### 3. Aba "Distribuição de Contatos"
- **Remover** o campo "Prefixo de TAG" do template global e a coluna `tag_prefixo` do uso (mantém a coluna no banco por compat, mas deixa de ler/escrever).
- Na lista de regiões da aba mostrar a TAG ao lado do nome da região (badge), com um lápis para editar inline.
- No `EnviarPacoteDialog`: substituir o input "Tag override" pela TAG da região (já vem preenchida, ainda editável só naquele envio se quiser).
- Preview e geração de `.vcf` / CSV Google / texto-bloco passam a usar `regiao.tag` em vez do prefixo global.

### 4. Helper `eleicao-distribuicao-contatos.ts`
- Sem mudança estrutural; segue recebendo `tagPrefixo` por chamada — só muda quem alimenta esse valor (região, não template).

### 5. Edge Function `eleicao-enviar-pacote-contatos`
- Aceitar e persistir `tag_regiao` no `eleicao_contato_lotes` (nova coluna `tag_regiao text`) para histórico/auditoria do que foi enviado.

## Arquivos afetados

- Migration: `eleicao_regioes.tag` + `eleicao_contato_lotes.tag_regiao` + backfill.
- `src/hooks/useRegioesEleicao.ts` — expor/editar `tag`.
- Painel de regiões (onde hoje se cadastra região) — input da tag.
- `src/components/eleicao/DistribuicaoContatosTab.tsx` — remover tag global, mostrar tag por região, passar tag certa pro dialog.
- `src/components/eleicao/EnviarPacoteDialog.tsx` — usar `regiao.tag`.
- `supabase/functions/eleicao-enviar-pacote-contatos/index.ts` — persistir `tag_regiao`.

## Resultado esperado

- Cada região tem sua TAG própria, configurável uma vez.
- vCard/CSV/texto exportados ou enviados saem com `TAG Nome` (ex: `MOR João Silva`) usando a tag DAQUELA região.
- A "tag de campanha" global some — não confunde mais.
