## Contexto

Hoje a tabela `tea_municipios_ms` tem 9 campos, mas vários aparecem como "—" no dossiê:
- `matriculas_tea_inep` → null (nunca foi coletada)
- `bpc_def_qtd` → null (nunca foi coletada)
- `capsi_qtd` = 0 e `caps_qtd` = 0 quando a CNES API não retorna nada
- `hab_por_caps` → null (depende de CAPS)

E o `gap_escolar` está usando a estimativa total como aproximação grosseira porque não há matrículas reais. Resultado: o card mostra muitas linhas vazias e o argumento político fica frágil.

## Objetivo

Transformar o bloco "Bandeira: Autismo" em um dossiê quantitativo robusto, com 3 camadas: **demografia → infraestrutura de atendimento → política pública/legislação**.

---

## Plano de enriquecimento (por camadas)

### 1. Demografia & Faixas Etárias (estimativas mais finas)
Hoje só temos "TEA total" e "TEA 0-17". Vamos quebrar em faixas de uso prático para a campanha:

| Campo novo | Como calcular | Para que serve |
|---|---|---|
| `est_tea_0_5_min/max` | pop 0-5 × prevalência | crianças em idade de creche/pré-escola — diagnóstico precoce |
| `est_tea_6_14_min/max` | pop 6-14 × prevalência | ensino fundamental — onde o gap escolar mais dói |
| `est_tea_15_17_min/max` | pop 15-17 × prevalência | transição para vida adulta |
| `est_tea_adultos_min/max` | pop 18+ × prevalência | invisibilizados — hoje sem política pública |
| `est_tea_homens_min/max` | aplicar razão 4:1 (CDC) | público típico |
| `est_tea_mulheres_min/max` | aplicar razão 1:4 (CDC) | subdiagnóstico feminino — pauta forte |

Fonte: pirâmide etária IBGE Censo 2022 (já temos o cód. IBGE de cada município).

### 2. Educação (INEP — Censo Escolar)
- `matriculas_tea_inep` → puxar do **Censo Escolar INEP** (microdados públicos, dataset `matricula_<ano>` filtrando `IN_TRANSTORNO_ESPECTRO_AUTISTA = 1`).
- Quebrar por: rede (municipal/estadual/privada), etapa (creche, pré, fundamental, médio), zona (urbana/rural).
- Novos campos derivados:
  - `gap_escolar_real` = estimativa 6-14 − matrículas reais
  - `pct_cobertura_escolar` = matrículas / estimativa
  - `qtd_aee_disponivel` (Atendimento Educacional Especializado)
  - `qtd_profs_aee` (professores AEE no município)

### 3. Saúde (CNES/SUS) — melhorar o que já existe
- Detectar tipo de CAPS por código oficial: CAPS I, II, III, AD, AD III, **CAPSi II/III** (hoje a heurística por string é frágil).
- Adicionar:
  - `centros_especializados_reabilitacao` (CER II/III/IV — atendem TEA)
  - `unidades_basicas_saude` total (denominador de capilaridade)
  - `pediatras_qtd`, `psicologos_qtd`, `fonoaudiologos_qtd`, `terapeutas_ocupacionais_qtd` (CBO via CNES profissionais)
  - `tempo_medio_diagnostico_estimado` (proxy: sem CAPSi = >2 anos; com CAPSi = ~12 meses)

### 4. Assistência Social (BPC/SUAS)
- `bpc_def_qtd` → puxar do **portal de transparência do MDS** (dataset BPC por município, filtro motivo = "deficiência").
- Adicionar:
  - `cras_qtd`, `creas_qtd` (Cadastro CadSUAS)
  - `bpc_def_0_17` (recorte criança/adolescente)
  - `bpc_def_pct_pop_estimada_tea` (cobertura)

### 5. Política Pública & Legislação local
- Verificar (via scraping do site da câmara municipal) se a cidade tem:
  - Lei municipal que reconhece a CIPTEA (Carteira de Identificação da Pessoa com TEA)
  - Lei do "fila zero" / atendimento prioritário
  - Casa de acolhimento / centro de referência TEA
  - Política de capacitação de servidores (educação/saúde)
- Campos: `lei_ciptea` (bool + nº lei), `centro_referencia_tea` (bool), `politica_capacitacao` (bool), `urls_fontes` (jsonb).

### 6. Comparativos & Ranking estadual
RPC nova `tea_ranking_ms` que para cada métrica retorna:
- Posição do município no ranking de MS (1º a 79º)
- Média estadual
- Top/bottom 3
Permite afirmações tipo: *"Campo Grande é a 2ª pior cidade de MS em cobertura escolar de crianças autistas"*.

---

## Como o agente coletará tudo isso

1. **Migração** — adicionar ~25 colunas em `tea_municipios_ms` + nova tabela `tea_legislacao_municipal` (1-N por lei) + RPC de ranking.
2. **Refatorar `tea-ms-sync`** em sub-coletas paralelas:
   - `coleta-demografia-ibge` (pirâmide etária)
   - `coleta-inep-tea` (matrículas + AEE)
   - `coleta-cnes-detalhado` (CAPS por tipo + profissionais)
   - `coleta-bpc-mds`
   - `coleta-leis-municipais` (busca Google + scraping leve)
3. **Cache de fontes oficiais** em `tea_fonte_cache` (jsonb por município/dataset/data) para não martelar APIs.
4. **Expor no dossiê (`narrativa-gerar` + PDF)**:
   - Sub-bloco "Diagnóstico TEA por faixa etária" (gráfico de barras textual)
   - Sub-bloco "Cobertura escolar real" (matrículas vs estimativa)
   - Sub-bloco "Capacidade de atendimento SUS" (CAPS, CER, profissionais)
   - Sub-bloco "Renda e proteção social" (BPC)
   - Sub-bloco "O que a cidade já fez (ou deixou de fazer)" (legislação)
   - Linha final de **ranking estadual** em cada métrica → munição para o discurso

5. **UI** — atualizar `BandeiraAutismoMS.tsx` para mostrar as novas dimensões em accordions/tabs e adicionar botões de re-sincronização granular (só INEP, só CNES, etc.).

---

## Decisões que preciso confirmar com você

Antes de começar, gostaria de saber:

1. **Escopo geográfico**: começamos só por **Campo Grande** (validar tudo) ou já rodamos para os **79 municípios de MS**? (impacta tempo de coleta e custo de API)
2. **Faixas etárias**: te interessa o recorte por **gênero (homem/mulher)** que mostra subdiagnóstico feminino? É uma pauta forte mas controversa.
3. **Legislação municipal**: posso usar **scraping simples de Google + sites das câmaras** (best-effort, com link de fonte) ou prefere que eu deixe esse campo para preenchimento manual via formulário?
4. **Dados nacionais comparativos**: quer que eu adicione **Brasil/Mato Grosso do Sul/Centro-Oeste** como linhas de referência em cada métrica (ex: cobertura escolar 38% no MS vs 45% no Brasil)?

Quando você responder, eu detalho a migração e começo a implementação.
