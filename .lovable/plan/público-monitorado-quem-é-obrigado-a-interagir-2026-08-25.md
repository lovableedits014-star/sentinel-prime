# Público monitorado: quem é obrigado a interagir

Hoje o público de uma publicação monitorada é resolvido automaticamente pela regra (cargo, região, cidade)
sobre os cadastros que já existem (Eleição, Contratados, Funcionários, Pessoas, contas do portal). Você quer
poder **montar a lista na mão** e ter uma tela que aponte quem está sem rede social ou telefone.

## Como o sistema identifica a rede social da pessoa

A ligação pessoa → perfil social já existe no banco (tabela de perfis por apoiador, uma linha por plataforma).
São três caminhos, e a nova tela vai oferecer os três na mesma linha:

1. **Digitar o @** — você escreve `@fulano` (Instagram) ou cola a URL do perfil do Facebook. Salvo via a função
   já existente de upsert de social por entidade.
2. **Vincular a partir de quem já comentou** — o sistema lista os autores de comentários capturados pela API que
   ainda não têm dono e sugere o vínculo por semelhança de nome. Um clique e o autor fica amarrado à pessoa.
   Esse é o caminho mais confiável no Facebook, onde o ID do autor não é o nome de usuário público.
3. **Só telefone** — se a pessoa não tem rede social cadastrada, ela ainda pode ser cobrada pelo clique no link
   rastreado da missão e pela conclusão declarada no portal (evidências E1 de clique e E2), que usam telefone.

## O que será construído

### 1. Lista manual de obrigados (com exceções)
- Nova sub-aba **Público monitorado** dentro de Engajamento → Monitoramento.
- Busca por nome/telefone sobre todos os cadastros, com filtros de cargo, região e cidade.
- Você marca as pessoas que entram no monitoramento; o grupo salvo pode ser usado por uma ou várias regras.
- A regra passa a ter um modo: **automático** (cargo/região, como hoje) ou **lista manual**. No modo automático
  você pode **incluir avulsos** e **dispensar** pessoas específicas — as exceções ficam gravadas.
- Ao gerar obrigações de uma publicação, o sistema usa: lista manual, ou público automático + inclusões − dispensas.

### 2. Painel "Faltam dados"
- Lista de todas as pessoas do público monitorado que estão **sem @ do Instagram**, **sem perfil do Facebook**
  ou **sem telefone**, com contadores no topo.
- Edição direta na linha: campo de @ do Instagram, campo de perfil/URL do Facebook e campo de telefone
  (normalizado no padrão brasileiro), salvando sem sair da tela.
- Botão **Sugestões** por pessoa: mostra autores de comentários ainda não vinculados com nome parecido, para
  vincular em um clique.
- Aviso explícito por linha do que a falta de dado impede: sem @ não há comprovação por comentário (E1);
  sem telefone não há comprovação por clique no link nem conclusão no portal.
- Exportação da lista de pendências em Excel para cobrar os dados pessoalmente.

### 3. Ajustes no que já existe
- O diálogo "Monitorar publicação" passa a mostrar o tamanho do público que será cobrado **antes** de gerar as
  obrigações, com o aviso de quantas dessas pessoas estão sem dados suficientes.
- O ranking ganha marcação visual para quem não tem meio de comprovação cadastrado, para não ser cobrado
  injustamente por um índice baixo causado por falta de cadastro.

## Detalhes técnicos

- Nova tabela `engagement_publico` (client, origem, ref_id, dados de snapshot, `incluido` / `dispensado`,
  `grupo_id` opcional) e `engagement_publico_grupos` (nome + descrição), com GRANTs, RLS por membro do cliente
  e trigger de `updated_at`.
- `engagement_regras` ganha `modo_publico` (`automatico` | `manual`) e `grupo_id`.
- `engagement_publico_alvo` passa a considerar o modo: lista manual do grupo, ou filtro automático somado às
  inclusões e subtraído das dispensas.
- Nova função `engagement_publico_pendencias(p_client_id, p_grupo_id)` retornando pessoa + flags
  `sem_instagram`, `sem_facebook`, `sem_telefone` e último comentário casado, para alimentar o painel.
- Reaproveitar `engagement_entity_upsert_social`, `engagement_entity_link_author` e
  `engagement_unlinked_authors` para gravar @ e vincular autores; nenhuma lógica nova de matching.
- Frontend: `src/components/engagement/PublicoMonitoradoTab.tsx` e `PendenciasDadosPanel.tsx`, com os wrappers
  novos em `src/lib/engagement-monitor.ts`. Normalização de telefone via `toWhatsAppBR` de `src/lib/phone-utils.ts`.
