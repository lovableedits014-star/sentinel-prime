## O que muda

Você apontou 3 problemas reais na aba **Ranking** atual:

1. Criei uma "meta" nova quando **já existe** a meta configurada em **Eleição → Indicações** (`meta_coordenador`, `meta_lider`, `meta_cabo` em `eleicao_indicacao_config`; e `quota_indicados` nos contratados).
2. Falta ver, dentro de cada coordenador/líder, **quem são os indicados dele** e o que cada um respondeu no telemarketing (vota / não vota / indeciso, em quem, observação).
3. A tabela está **poluída** — coluna demais, difícil bater o olho e entender quem está performando.

## 1) Usar a meta que você já configura

- Remover a "meta inventada" (`f.qt * 10`) da RPC `tele_ranking_indicadores`.
- Ler de `eleicao_indicacao_config` do cliente:
  - coordenador → `meta_coordenador`
  - líder → `meta_lider`
  - cabo/liderado (contratados) → `quota_indicados` da pessoa, ou `meta_cabo` como fallback.
- Aparecer um aviso discreto no topo: "Meta atual: coordenador {X} · líder {Y} · cabo {Z} — editar em Eleição → Indicações" com link.

## 2) Drill-down por pessoa (o ponto central)

Linha da tabela vira **clicável** → abre `Sheet` lateral (drawer) com 3 blocos:

**Cabeçalho do drawer**
- Nome, tipo, cidade/bairro, telefone, coordenador (se for líder).
- KPIs grandes: Indicados · Ligados · ✅ Confirmados · 🤔 Indecisos · ❌ Não vota · ⏳ Pendentes · % Conversão · Meta {X} → barra de progresso.
- Botão "Copiar link de indicação" (reaproveita o token público que ele já recebe, se existir em `eleicao_indicacao_tokens`).

**Bloco "Líderes" (só se for coordenador)**
- Mini-tabela dos líderes daquele coordenador: nome · indicados · confirmados · % conv · última atividade. Linha do líder também é clicável → abre o drawer dele.

**Bloco "Indicados dele" (o que você pediu)**
- Lista de `eleicao_indicados` (ou `contratado_indicados`) onde `indicador_id = pessoa.id`.
- Colunas: Nome · Telefone · Cidade/Bairro · **Vota?** (badge verde/amarelo/vermelho/cinza) · **Candidato alternativo** (quando "não vota") · Status da ligação · Operador · Última ligação · Observação do tele (tooltip).
- Filtro rápido por voto (Todos · Confirmados · Indecisos · Não vota · Pendentes) e busca por nome/telefone.
- Botão "Exportar CSV" só dessa pessoa.
- Para coordenador, toggle "Incluir indicados dos líderes" (rollup on/off).

Nova RPC enxuta para alimentar o drawer:
`tele_ranking_indicados_da_pessoa(_client_id, _pessoa_id, _universo, _incluir_filhos, _campanha_id, _data_de, _data_ate)` retornando uma linha por indicado já com o `vota_candidato`, `ultimo_status_ligacao`, `operador_nome`, `observacao_tele`, `ultima_ligacao_em`, `candidato_alternativo`, `indicador_nome` (para saber via qual líder veio quando rollup ligado).

## 3) Tabela mais limpa

A tabela principal hoje tem 13 colunas. Reduzir para o essencial e mover detalhes pro drawer:

| # | Pessoa | Cidade | Indicados | Confirmados | % Conv. | Meta | Última atividade |

- **Pessoa**: nome + sub-linha pequena com tipo + coordenador (quando líder). Acaba com as colunas "Tipo" e "Coordenador" separadas.
- **Indicados**: número com mini-stack inline (3 barrinhas verde/amarelo/vermelho representando conf/indec/rej) — comunica composição sem coluna extra.
- **Meta**: célula com `12/30` + barra de progresso fina. Substitui Meta + Δ Meta.
- Indecisos, Rejeitados, Pendentes, Líderes, Ligados → vão pro drawer.
- Linha inteira clicável; chevron à direita indica drill-down.
- Cabeçalho da página: apenas os 3 cards de destaque atuais + filtros num único `<details>` colapsável ("Filtros avançados"). Por padrão mostra só Universo (Eleição/Contratados) e Período (atalhos: Hoje · 7d · 30d · Tudo). Campanha e Tipo ficam dentro do colapsável.
- Tirar o card "Coordenadores inativos" do topo e virar uma faixa de alerta sutil (uma linha) só quando houver inativos.

## Estrutura técnica

```text
Migration
├── DROP/CREATE tele_ranking_indicadores
│   └── meta vinda de eleicao_indicacao_config (LEFT JOIN por client_id)
│       coordenador → meta_coordenador
│       lider       → meta_lider
│       liderado    → COALESCE(c.quota_indicados, cfg.meta_cabo)
└── CREATE tele_ranking_indicados_da_pessoa(...)
    └── SECURITY DEFINER, mesma checagem de acesso da RPC atual
        Retorna lista de indicados com campos do telemarketing.

UI
├── RankingTable.tsx          → enxuta, linha clicável, progresso inline
├── RankingPersonDrawer.tsx   → novo (KPIs + líderes + indicados)
├── IndicadosDaPessoaList.tsx → novo (lista filtrável)
├── RankingFilters.tsx        → novo (atalhos de período + colapsável)
└── TelemarketingAdminRanking.tsx → orquestra estado do drawer/filtros
```

## O que NÃO muda

- Estrutura do telemarketing, fluxo do operador, painéis Resultados/Relatórios/Filas.
- A configuração de meta em Eleição → Indicações (só **passa a ser respeitada** pelo ranking).
- O cálculo de rollup (coordenador soma líderes) já está certo.
