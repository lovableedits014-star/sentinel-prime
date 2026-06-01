## Contexto

Hoje líderes podem ser salvos sem coordenador (a opção **"— Sem vínculo —"** já existe no formulário) e aparecem em cada região dentro do mini-bloco **"Líderes sem coordenador"** (linhas 1105-1110 de `Eleicao.tsx`). Tecnicamente, `gerarContratoIndividual` e `gerarLoteZip` (em `src/lib/eleicao-contrato-docx.ts`) já tratam `parent_id` nulo — preenchem `{coordenador}` com `—`.

Os problemas reais são de **UX e medição**:
- O botão "Baixar contrato" da linha fica desabilitado quando `valor_contratacao = 0`, sem explicar o porquê.
- Não há botão para gerar lote **só dos avulsos**.
- Relatórios (`PrevisaoCustos`, KPIs, export) não os destacam.
- O fluxo de notificação (`NotifyProgressDialog`) tenta etapa "Coordenador" mesmo quando o líder é avulso (vai pular sozinho, mas polui visualmente).
- A opção "Sem vínculo" no select é discreta — o usuário não percebe que é válida.

## Plano

### 1. Formulário (`src/pages/Eleicao.tsx`)
- Quando `tipo = lider`, exibir **checkbox em destaque**: "Líder avulso (sem coordenador vinculado)". Marcado → esconde o select "Indicado por" e força `parent_id = null`.
- Quando não há coordenadores na região, o checkbox já vem marcado por padrão e mostra um aviso explicativo.

### 2. Mini-bloco "Líderes avulsos" no RegionBlock
- Renomear o cabeçalho para **"Líderes avulsos (sem coordenador)"**.
- Mostrar **contagem + valor total + quantos sem valor** ao lado do título.
- Adicionar botão **"📄 Contratos avulsos"** que chama `gerarContratosLote` filtrando apenas os órfãos daquela região.

### 3. KPI e filtro
- Adicionar KPI **"Avulsos"** na aba Cadastros (`stats.avulsos = lideres sem parent_id no escopo`).
- Adicionar opção **"Avulsos (sem coordenador)"** ao `statusFilter` (já tem "todos / sem valor / sem acesso").

### 4. Tooltip no botão "Baixar contrato"
- No `PessoaRow`, quando `disabled={semValor}`, adicionar `title="Defina o valor em 'Pendentes de valor' para liberar o contrato"` para o usuário entender o bloqueio. (Vale para todos os tipos, não só avulsos.)

### 5. Relatório de custos (`src/components/eleicao/PrevisaoCustos.tsx`)
- Abaixo da linha "Líderes", adicionar sub-linha **"↳ dos quais avulsos: N · R$ X"** para que o usuário meça o peso dos avulsos no custo total.

### 6. Export PDF/CSV (`src/lib/eleicao-export-pdf.ts` e CSV equivalente)
- Quando `tipo = lider` e `parent_nome` é nulo, exibir **"— AVULSO —"** na coluna "Indicado por", para que o relatório impresso destaque visualmente.

### 7. Fluxo de notificação ao criar líder avulso
- No `save()`, quando o líder novo é avulso, **abrir o `NotifyProgressDialog` direto na etapa do líder** (pulando "Coordenador" e "Secretaria") — ou pular essas etapas internamente exibindo "ignorado: líder avulso". Solução pragmática: passar um prop opcional `skipSteps={['coordenador','secretaria']}` ao dialog e marcá-las como `skipped` antes de rodar.

## Arquivos afetados

- `src/pages/Eleicao.tsx` — form, KPI, filtro, RegionBlock, tooltip, chamada ao NotifyProgressDialog.
- `src/components/eleicao/NotifyProgressDialog.tsx` — aceitar `skipSteps`.
- `src/components/eleicao/PrevisaoCustos.tsx` — sub-linha de avulsos.
- `src/lib/eleicao-export-pdf.ts` e helper de CSV — marcar "AVULSO".

Sem mudanças de banco de dados.
