## Contexto

A campanha é do **estadual principal** (sempre o "dono" da operação). Alguns coordenadores/líderes/cabos trabalham também para um **deputado federal parceiro** (dobradinha). O federal entra ajudando a bancar parte dos custos dessas pessoas. A arte e os fluxos de divulgação **não mudam** — continuam centralizados no estadual; o que muda é a **gestão financeira e o relatório por candidato**.

## O que já existe

- `eleicao_pessoas` com `valor_contratacao`, `escopo`, `regiao/cidade`, `parent_id` (hierarquia coord → líder → cabo).
- Aba "Previsão de custos" (`PrevisaoCustos.tsx`) somando totais por tipo / escopo / região.
- `PendentesValorPanel`, `IndicacoesPanel`, `EntradaGrupoPanel`, etc.
- Não há nenhuma noção de "candidato parceiro" hoje — todo custo é tratado como único.

## Modelo proposto

### 1. Cadastro de candidatos parceiros (federais)

Nova tabela `eleicao_candidatos_parceiros` por `client_id`:
- `nome`, `cargo` (ex.: "Deputado Federal"), `partido`, `numero_urna`, `foto_url`, `cor` (badge), `ativo`.
- Permite cadastrar quantos federais quiserem; cada um aparece como chip colorido no app.

### 2. Vínculo pessoa ↔ federal + rateio

Acrescentar em `eleicao_pessoas`:
- `parceiro_id uuid` (nullable) → referência ao federal da dobradinha (ou NULL = só estadual).
- `rateio_estadual numeric default 100` (0–100) — % que o estadual paga.
- `rateio_parceiro numeric default 0` — % que o federal paga (soma deve dar 100, validado por trigger).
- Atalhos no formulário: botões "100% estadual", "100% federal", "50/50", "custom".

Hierarquia: ao criar um líder/cabo abaixo de um coordenador já vinculado a um federal, o sistema **sugere** o mesmo federal (mas permite trocar — útil para o cenário "coordenador do estadual com líderes que trabalham pro federal").

### 3. Previsão de custos repensada

Reformular `PrevisaoCustos.tsx` para mostrar:

- **Card-resumo por candidato** (estadual + cada federal): total a pagar, qtd de pessoas envolvidas, % do bolo total.
- Gráfico de barras empilhadas: por tipo (coord/líder/cabo) × candidato pagador.
- Tabela "Quem paga quem": linha por pessoa com colunas `valor total | estadual paga | federal paga | federal nome`.
- Filtro no topo da aba: "Ver custos de: [Todos | Estadual | Federal X | Federal Y]" — recalcula todos os gráficos.
- Por região/cidade: mantém, mas com toggle "consolidado / só estadual / só federal X".

### 4. Indicações e ranking

- `IndicacoesPanel` e ranking de telemarketing: adicionar filtro por `parceiro_id` para responder "quantos votos o time do Federal X está trazendo".
- Os indicados continuam únicos (estamos pedindo voto pros dois), só muda a atribuição de quem trouxe.

### 5. Exportações

- `ExportEleicaoDialog` ganha opção "Separar por candidato" → gera um PDF/Excel por candidato com pessoas, custos e indicações daquele federal + o estadual.
- Útil na hora de prestar contas e mostrar pro federal o que ele está bancando.

### 6. UI — onde isso aparece

- **Nova mini-aba** "Dobradinhas" dentro de Configurações da Eleição → CRUD dos federais parceiros.
- Formulário de cadastro de pessoa (`NovaPessoaDialog` da eleição): nova seção "Dobradinha" com select do federal + sliders/atalhos de rateio.
- Listagem de pessoas: badge colorido do federal ao lado do nome quando houver.
- "Previsão de custos": filtro de candidato no topo + cards-resumo por candidato.

## Detalhes técnicos

- Migrations:
  1. `CREATE TABLE eleicao_candidatos_parceiros` (com GRANTs + RLS por client_id, espelhando o padrão de `eleicao_regioes`).
  2. `ALTER TABLE eleicao_pessoas ADD COLUMN parceiro_id`, `rateio_estadual`, `rateio_parceiro` + trigger validando soma = 100 e parceiro_id consistente com rateio>0.
- Backfill: todas as pessoas existentes ficam com `parceiro_id NULL`, `rateio_estadual=100`, `rateio_parceiro=0` (comportamento atual preservado).
- `useRegioesEleicao`-equivalente: criar `useCandidatosParceiros` (CRUD + cache).
- `PrevisaoCustos.tsx`: refator do `useMemo` para agrupar por `parceiro_id` calculando `valor * rateio_x / 100`.
- Sem mudanças em: artes, frames, materiais, disparos, fluxos de WhatsApp (conforme combinado).

## Fora do escopo (não vou mexer agora)

- Arte e materiais da dobradinha (federal traz por fora).
- Links públicos / grupos separados por federal.
- Disparos segmentados por federal.

## Entregáveis

1. Migration criando tabela de parceiros + colunas de dobradinha em `eleicao_pessoas`.
2. CRUD de candidatos parceiros (config).
3. Campo de dobradinha + rateio no cadastro/edição de pessoa.
4. `PrevisaoCustos` reformulado com filtro por candidato e visão "quem paga quem".
5. Filtro por parceiro em Indicações e ranking.
6. Exportação separada por candidato.
