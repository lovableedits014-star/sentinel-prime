## Objetivo

Na página **Eleição → Exportar cadastros**, permitir filtrar/segmentar a exportação pela **dobradinha** (candidato parceiro federal — deputado, senador etc.), mantendo o layout atual dos PDFs/CSVs (lista simples e raiz hierárquica).

## Contexto

- A dobradinha é armazenada na **raiz** (coordenador): campos `parceiro_id`, `rateio_estadual`, `rateio_parceiro` em `eleicao_pessoas`. Líderes/cabos herdam do coordenador ancestral.
- Parceiros ativos já vêm do hook `useCandidatosParceiros` (`PARCEIROS` em `Eleicao.tsx`).
- O diálogo atual (`ExportEleicaoDialog.tsx`) já filtra por escopo, região/cidade, tipo, coordenador e avulsos. Falta o eixo "dobradinha".

## Mudanças

### 1. `ExportEleicaoDialog.tsx` — novo filtro "Dobradinha"

- Nova prop `parceiros: { id: string; nome: string; cor?: string }[]`.
- Novo `Select` "Dobradinha (candidato parceiro)" com opções:
  - `Todas as dobradinhas` (default)
  - `Sem dobradinha (100% estadual)`
  - Um item por parceiro ativo (nome + bolinha colorida)
- Novo `Switch` **"Gerar um arquivo por dobradinha"** (só habilitado quando "Todas as dobradinhas" está selecionado). Ao ligar, o export produz um PDF/CSV separado para cada parceiro presente na seleção + um "Sem dobradinha" quando aplicável — útil para entregar o corte pronto a cada candidato parceiro.
- Adicionar `parceiroId: string | null` e `porParceiro: boolean` ao tipo `ExportConfig`.
- Mostrar chip/aviso quando o filtro reduzir a zero.

### 2. `Eleicao.tsx` — `handleExport`

- Construir um índice `raizPorId` (mapa `pessoaId → { parceiro_id, rateio_estadual, rateio_parceiro, nome }`) subindo `parent_id` até a raiz. Já existe lógica similar no render; extrair util `getRaizDobradinha(p, pessoas)`.
- **Filtro simples**: quando `cfg.parceiroId` estiver definido, filtrar `base` pelas pessoas cuja raiz tem `parceiro_id === cfg.parceiroId` (ou `null` para "Sem dobradinha").
- **Segmentado (`porParceiro=true`)**: agrupar `listaTipada` por `raiz.parceiro_id` (incluindo `null`) e chamar o exportador uma vez por grupo, com:
  - `filtros` incluindo `{ label: "Dobradinha", value: <nome do parceiro | "Sem dobradinha"> }`
  - nome de arquivo sufixado com o parceiro (ex.: `eleicao-CG-Fulano-Federal.pdf`)
- Passar `parceiros` para o diálogo a partir de `PARCEIROS`.

### 3. Exportadores (`src/lib/eleicao-export-pdf.ts` e o CSV correspondente)

- **Não alterar o layout do documento**. Apenas:
  - Aceitar um campo opcional `tituloComplemento?: string` (ex.: `"Dobradinha: Fulano (60/40)"`) que entra no bloco de "Filtros aplicados" já existente — o formato do documento fica idêntico.
  - Aceitar `fileNameSuffix?: string` para nomear os arquivos ao gerar em lote.
- Nenhuma mudança em fontes, cabeçalhos, colunas, agrupamento raiz, etc.

### 4. Toasts / UX

- Um único toast final quando `porParceiro=true`: `"N arquivos gerados (X registros no total)"`.
- Quando um grupo estiver vazio, pular silenciosamente.

## Fora de escopo

- Coluna nova nos PDFs/CSVs mostrando dobradinha em cada linha (o usuário pediu para manter o padrão do documento).
- Rateio/valores por parceiro (custos): já existe a aba Custos; nada muda ali.
- Mudanças no fluxo de cadastro/edição de dobradinha.

## Arquivos a tocar

- `src/components/eleicao/ExportEleicaoDialog.tsx` (novo filtro + switch, novos campos no `ExportConfig`)
- `src/pages/Eleicao.tsx` (`handleExport`, passagem de `parceiros`)
- `src/lib/eleicao-export-pdf.ts` (aceitar `tituloComplemento` e `fileNameSuffix`; layout inalterado)
- CSV helper equivalente (mesma assinatura ampliada)
