## Diagnóstico (o que está errado hoje)

**Bug crítico — Foco Campo Grande:** a query lê `tse_votacao_zona` filtrando só por `cargo` e `turno`, sem filtrar por município. Resultado: aparecem candidatos de outras cidades misturados (você viu "eleitos" que não conhece). Mesmo bug afeta o ranking por zona e os exports.

**Confusão estrutural — 5 abas com sobreposição:**
- *Panorama* (mapa + partidos) e *Candidatos & Chapa* (comparar/composição/simulador) tratam dimensões parecidas em cliques diferentes.
- *Foco Campo Grande* é uma 6ª camada que só faz sentido quando o filtro global já é Campo Grande — virou aba dupla.
- *Inteligência Política* mistura coisas distintas: parlamentares, contexto IBGE e bandeira Autismo (que é o ativo mais valioso pro candidato).
- *Narrativa* fica no fim como apêndice, quando deveria ser o **destino** de tudo.

**Linguagem técnica demais:** "TSE 2022+2024", "zona eleitoral", "votos válidos" sem explicar o que o candidato faz com aquilo.

**Sem fluxo:** o usuário precisa adivinhar a ordem. Não há "próximo passo" sugerido.

---

## Visão nova — Inteligência Eleitoral como funil estratégico

Reorganizo em **4 etapas numeradas** (mantendo o que é bom, fundindo o redundante):

```text
┌─────────────────────────────────────────────────────────────┐
│  1. TERRITÓRIO          → Onde estão meus votos?            │
│     (Panorama + IBGE + Foco CG embutido)                    │
│           ↓                                                  │
│  2. ADVERSÁRIOS         → Contra quem eu disputo?           │
│     (Comparar + Composição + Simulador + Radar parlamentar) │
│           ↓                                                  │
│  3. BANDEIRA            → Qual é minha agenda diferenciada? │
│     (Autismo MS + futuras bandeiras)                        │
│           ↓                                                  │
│  4. DOSSIÊ DE NARRATIVA → O plano de campanha pronto.       │
│     (PDF executivo + roteiros + plano de campo)             │
└─────────────────────────────────────────────────────────────┘
```

Cada etapa abre com um **card-explicação** em linguagem leiga ("O que é isso, em uma frase / Pra que serve na sua campanha / Próximo passo: ir para a etapa X").

---

## Mudanças por etapa

### Etapa 1 — Território
- **Conserta o bug**: toda query no nível município passa a filtrar por `cod_municipio`. Foco Campo Grande deixa de ser aba e vira um **botão "Ver rua a rua"** que aparece quando o filtro global = Campo Grande/MS.
- Mapa de calor + ranking dos top municípios + contexto IBGE consolidados em uma só visão.
- Migrações de partido (que estava em *Panorama*) viram um bloco resumido aqui — só "quem subiu / quem caiu" no município selecionado.

### Etapa 2 — Adversários
- Funde *Comparar candidatos*, *Composição de chapa*, *Simulador* e *Radar parlamentar* em uma única tela com sub-abas internas.
- Adiciona **"Mapa de ataque"**: para cada adversário forte, lista 3 vulnerabilidades baseadas em dados (faltas em votação, propostas opostas à bandeira, queda eleitoral entre 2022→2024).

### Etapa 3 — Bandeira
- Mantém *Autismo MS* como bandeira-mãe.
- Adiciona placeholder visual "Adicionar nova bandeira" (educação, segurança, etc.) — não implemento as outras agora, mas deixo a arquitetura pronta.
- Resumo executivo da bandeira no topo: "X municípios têm lei CIPTEA, Y não têm — sua campanha pode propor isso em Z cidades."

### Etapa 4 — Dossiê de Narrativa (peça central)
A IA passa a consumir **as três etapas anteriores** automaticamente (não precisa o usuário "preencher" nada). Gera 4 entregáveis:

1. **PDF executivo** (já existe, melhoro): diagnóstico do território + adversários priorizados + bandeira + plano por bairro/zona.
2. **Roteiros de discurso e debate**: 5 falas prontas por tema, 5 respostas a ataques previsíveis dos adversários.
3. **Conteúdo para redes**: 10 posts/legendas/mensagens WhatsApp já com os números do município.
4. **Plano de campo**: lista priorizada de bairros/zonas/escolas para visitar, com justificativa em uma linha por item.

Adiciono botão **"Atualizar dossiê"** que regenera quando os filtros mudam.

---

## Detalhes técnicos

**Frontend** (sem mexer em backend pesado):
- `src/pages/InteligenciaEleitoral.tsx`: troca as 5 `TabsTrigger` por 4 etapas numeradas com indicador visual de progresso e botão "Próxima etapa" no rodapé de cada uma.
- `src/components/inteligencia/cg/CampoGrandeAnalise.tsx`: adiciona `.eq("cod_municipio", 5002704)` nas queries de `tse_votacao_zona` e `tse_votacao_local` (corrige o bug). Renomeia para `AnaliseHiperLocal` e aceita `codigoIbge` como prop para funcionar em qualquer município no futuro.
- Novo `src/components/inteligencia/_shared/EtapaHeader.tsx`: card padronizado com "O que é / Pra que serve / Próximo passo".
- Novo `src/components/inteligencia/adversarios/MapaDeAtaque.tsx`: cruza dados de `RadarParlamentar` + `CompararCandidatos`.
- `NarrativaPolitica.tsx`: refatora para gerar 4 entregáveis em vez de 1, usa `useEleitoralFilters()` direto (sem inputs manuais).
- `narrativa-gerar` (edge function): atualiza prompt para devolver objeto com 4 seções estruturadas.

**Não vou mexer em:**
- Schema do banco (já está rico o suficiente).
- Sistema de filtros globais (`EleitoralScopeBar` está bom).
- Componente IBGE (`MunicipioContextoIBGE`).
- Bandeira Autismo (já foi enriquecida na rodada anterior).

---

## Riscos e o que fica de fora desta rodada

- **Não vou** implementar bandeiras além de Autismo (placeholder apenas).
- **Não vou** automatizar atualização de dossiê em background — fica manual via botão.
- O bug do Foco CG provavelmente afeta outras telas que usam `tse_votacao_zona` sem filtro de município; vou auditar e listar pra você ao fim, mas só corrijo as que estão no escopo da Inteligência Eleitoral.
- Decisões que tomei sem você (já que pediu pra decidir): cargo-foco = Vereador em Campo Grande/MS com bandeira Autismo, e mantive todas as funcionalidades atuais (nada vai ser deletado, só reorganizado).

Se quiser ajustar qualquer destas decisões antes de eu começar, me diga agora. Caso contrário, aprovo e parto para a execução.