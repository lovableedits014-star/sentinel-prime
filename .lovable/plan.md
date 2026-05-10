
# Reestruturação da Inteligência Eleitoral + Bandeira Autismo

## Por que mexer

Hoje a aba **Inteligência Eleitoral** tem 5 grupos (Panorama, Candidatos & Chapa, Inteligência Política, Hiperlocal CG/MS, Narrativa), mas:
- A informação está densa e técnica, sem texto explicando "para que serve" cada coisa para quem não é analista político.
- O **Contexto Territorial (IBGE)** traz indicadores genéricos (IDH, IDEB, esgoto…) mas **não traz nada sobre autismo (TEA)**, que é a principal bandeira do candidato.
- A **Narrativa Política** gera textos a partir desses dados — então, sem dados de TEA, ela nunca vai produzir um dossiê forte sobre a bandeira do candidato.

A proposta resolve as duas coisas: **(1) injeta dados oficiais de TEA no MS** e **(2) reorganiza/explica as abas** para qualquer pessoa entender o que extrair de cada uma.

---

## Parte 1 — Painel "Bandeira: Autismo (TEA) no MS"

Nova sub-aba dentro de **Inteligência Política**, ao lado de "Radar Parlamentar" e "Contexto Territorial (IBGE)":

**🧩 Bandeira: Autismo no MS**

O que vai mostrar (dados públicos, sem inventar números):

1. **Estimativa populacional TEA por município de MS**
   - Aplica a prevalência de referência do CDC (≈1 em 36, ~2,8%) sobre a população IBGE de cada município.
   - Mostra: estimativa absoluta, % da população, faixa etária 0–17 (público escolar prioritário).
   - Marcado claramente como **estimativa baseada em prevalência internacional** — não é censo.

2. **Matrículas de alunos com TEA na rede pública (INEP/Censo Escolar)**
   - Coleta via API pública INEP por município.
   - Compara com a estimativa → **gap de cobertura escolar** (quantos provavelmente estão fora ou não diagnosticados).

3. **CAPS / serviços de saúde mental (CNES/DATASUS)**
   - Quantos CAPS Infantojuvenil (CAPSi) e CAPS no município.
   - Razão habitantes por CAPS — útil para narrativa sobre carência de atendimento.

4. **Benefícios BPC/LOAS por deficiência (TEA inclui-se)** — quando disponível por município no DataPrev/MDS.

5. **Ranking MS dos 79 municípios** por:
   - Maior gap (estimativa TEA vs matrículas) → onde a bandeira ressoa mais.
   - Pior cobertura CAPSi.
   - Concentração eleitoral do candidato (cruza com TSE já existente) → **mapa de prioridade de campanha**.

Esses dados ficam disponíveis para a aba **Narrativa**, que ganha um botão **"Gerar dossiê: Autismo no MS"** com argumentos prontos por município (estimativa, lacuna, CAPSi, voto).

### Como entregar tecnicamente (resumo)
- Tabela `tea_municipios_ms` (codigo_ibge, populacao, est_tea_total, est_tea_0_17, matriculas_tea_inep, ano_inep, capsi_qtd, caps_qtd, bpc_def, fonte_json, atualizado_em).
- Edge function `tea-ms-sync` que: lê `municipios_indicadores` (já existe) → puxa INEP Censo Escolar (matrículas TEA) → puxa CNES (CAPS) → calcula estimativa CDC → grava na tabela.
- Componente `<BandeiraAutismoMS />` com ranking, mapa de calor (reusa `MapaCalorMunicipios`) e cards por município.
- Hook na NarrativaPolitica que injeta bloco "Autismo" no prompt do dossiê quando UF=MS.

---

## Parte 2 — Reestruturação das abas (mais clara, com explicações)

Mantém as 5 abas, mas:
- Adiciona em cada uma um **bloco "Para que serve"** em linguagem simples (1 frase do problema + 1 frase do que fazer com o resultado).
- Renomeia "Hiperlocal · CG/MS" → "🏙️ Foco Campo Grande" (mais claro).
- Move o card de "Coletar dados de uma UF" do Contexto Territorial para um **drawer "⚙️ Coletar dados oficiais"** acessível por botão no topo, porque é setup, não consulta diária.

### Mapa final das abas

```text
INTELIGÊNCIA ELEITORAL
│
├── 📊 Panorama eleitoral
│     "Onde estão os votos no território e como os partidos se moveram."
│     • Mapa de calor por município (TSE 2022+2024)
│     • Partidos & migrações
│
├── 👥 Candidatos & Chapa
│     "Quem são os adversários, quem pode somar, e como montar uma chapa."
│     • Comparar candidatos
│     • Composição (2022 + 2024)
│     • Simulador de chapa
│
├── 🏛️ Inteligência Política
│     "Munição em tempo real: o que os adversários andam fazendo + contexto do município."
│     • Radar Parlamentar (votações/projetos/presença adversários)
│     • Contexto Territorial IBGE (30+ indicadores socioeconômicos)
│     • 🆕 Bandeira: Autismo no MS  ← novo
│
├── 🏙️ Foco Campo Grande (era "Hiperlocal · CG/MS")
│     "Análise rua a rua: zona eleitoral, escola, bairro."
│
└── 📣 Narrativa Política
      "Transforma os dados acima em mensagens prontas e dossiê do candidato."
      • Geração geral
      • 🆕 Botão "Dossiê: Autismo no MS" (puxa Parte 1)
```

### "Para que serve" — texto curto que aparecerá em cada aba

| Aba | O que é | O que extrair |
|---|---|---|
| Panorama | Foto do território nas últimas eleições | Onde investir comício/visita; onde o partido perdeu/ganhou força |
| Candidatos & Chapa | Raio-x dos adversários e dos potenciais aliados | Quem chamar para a chapa; quem é o real concorrente em cada cidade |
| Inteligência Política | Atividade dos parlamentares + realidade do município | Argumentos para debate ("seu adversário faltou X votações"); demanda local que casa com o programa |
| Foco Campo Grande | Granularidade até a urna | Onde colocar cabo eleitoral, qual escola priorizar |
| Narrativa | IA escreve textos e dossiês a partir dos dados | Discursos, posts, dossiê de bandeira (autismo, etc.) |

---

## Entrega em fases

1. **Fase A (rápida, sem dados novos)** — adicionar os blocos "Para que serve", renomear abas, mover coletor para drawer. *Só UI/cópia.*
2. **Fase B (núcleo do pedido)** — criar tabela `tea_municipios_ms`, edge function `tea-ms-sync`, e componente `<BandeiraAutismoMS />` com ranking + cards.
3. **Fase C** — integrar bloco TEA no prompt da Narrativa + botão "Gerar dossiê: Autismo no MS" com export PDF/DOCX (reusa `eleicao-contrato-docx` / `dashboard-pdf-export`).

---

## O que eu preciso confirmar antes de codar

1. **Prevalência**: usar **CDC 1:36 (2,8%)** como referência (mais atual e citada no Brasil pelo MS) ou a antiga 1:54?
2. **Matrículas TEA**: posso usar o **Censo Escolar INEP** (dado oficial mais granular disponível) — confirmar OK.
3. **Escopo geográfico**: começar **só MS (79 municípios)** como pediu, com arquitetura pronta para ligar outros estados depois. OK?
4. **Dossiê em Narrativa**: gerar como **PDF + DOCX** para você imprimir/enviar, ou só visualização na tela?
