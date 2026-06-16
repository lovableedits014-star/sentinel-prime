## Visão geral

Duas mudanças independentes, sem misturar com a estrutura de "contratados" (coordenador/líder/cabo já existente):

1. **Indicações de votos voluntários**: cada coordenador/líder/cabo passa a ter **link já pronto** (sem botão "Gerar link"). O fluxo vira "enviar o link via WhatsApp" para que a pessoa cadastre seus indicados orgânicos. O coordenador também acessa essa área dentro do **Portal do Coordenador** (separada visualmente dos cadastros de líderes/cabos contratados).
2. **Mensagem única "Grupo + Foto"**: o botão atual de "enviar link da foto" no Portal do Coordenador passa a enviar **uma única mensagem combinada** — primeiro o convite para o grupo da região (prioridade), depois o link da foto de perfil da campanha.

---

## Parte 1 — Links de indicação automáticos

### 1.1 Banco (migration)

- **Função `eleicao_garantir_token_indicador(_indicador_id uuid)`**: igual à `eleicao_gerar_token_indicador`, mas **idempotente** — se já existe token ativo (`revoked_at IS NULL`), retorna o existente em vez de revogar e criar outro. (Mantemos `eleicao_gerar_token_indicador` para o caso de "regenerar manualmente" no painel admin.)
- **Trigger `AFTER INSERT` em `eleicao_pessoas`**: para todo novo coordenador/líder/cabo, chama `eleicao_garantir_token_indicador(NEW.id)`. Roda como `SECURITY DEFINER` para não esbarrar em RLS.
- **Backfill**: cria token para todo `eleicao_pessoas` que ainda não tem linha ativa em `eleicao_indicacao_tokens`.
- **Nova RPC `eleicao_listar_indicadores_team(_coordenador_id uuid)`** (`SECURITY DEFINER`): retorna a mesma shape de `v_eleicao_indicadores_cobranca`, filtrada para o coordenador logado + descendentes (líderes e cabos abaixo dele, via CTE recursiva). Valida `auth.uid() = (SELECT user_id FROM eleicao_pessoas WHERE id = _coordenador_id)`.
- **Grant `EXECUTE`** das novas funções para `authenticated`.

### 1.2 Painel admin (`IndicacoesPanel.tsx`)

- Remover o botão **"Gerar link"** quando `r.token` é `null` — nunca mais vai aparecer null após o backfill + trigger.
- Manter o botão **"Regenerar"** (ícone `RefreshCw`) como ação avançada.
- Renomear copy para **"Votos voluntários — cobrança"**, ajustar template padrão para deixar claro que são **votos voluntários (orgânicos, não contratados)**.

### 1.3 Página pública (`IndicarPublico.tsx`)

- Ajustar copy do subtítulo padrão para "Cadastre pessoas que vão votar em {candidato} por convicção — eleitores, não contratados". Sem mudança estrutural.

### 1.4 Portal do Coordenador (`PortalCoordenador.tsx`)

- Nova seção **"Votos voluntários"**, separada da árvore de contratados, com aviso explicativo.
- Tabela compacta com o coordenador + cada líder/cabo do time:
  - Nome, tipo, meta, total indicado, progresso.
  - Botão **"Enviar link via WhatsApp"** (mensagem padrão + link de indicação).
  - Botão **"Copiar link"**.
  - Para o próprio coordenador no topo, com "Abrir minha página de indicação".
- Dados via `eleicao_listar_indicadores_team`.

---

## Parte 2 — Mensagem combinada "Grupo + Foto" no Portal do Coordenador

### 2.1 Dados

- Reutilizar `eleicao_notif_config.grupos_links` (`Record<regiao, url>`) — mesma fonte do fluxo de cadastro.
- No `load()` do `PortalCoordenador`, buscar `grupos_links` e resolver `linkGrupo = grupos_links[me.regiao]`.

### 2.2 UI — sem botão novo

- O botão atual **"Enviar link da foto via WhatsApp"** (linhas 342 e 488 de `PortalCoordenador.tsx`) **continua sendo um único botão**, mas o `sendFotoWhats` é substituído por `sendBoasVindasWhats(pessoa, linkGrupo, linkFoto, clientName)`, que monta **uma só mensagem** com as duas partes:

  > Oi {primeiro_nome}! Que bom ter você com a gente na campanha do {candidato}. 🙌
  >
  > **1) Entre no nosso grupo de WhatsApp da região {regiao}** — é por lá que a gente alinha as missões, manda os conteúdos para você compartilhar nas redes e tira dúvidas em tempo real:
  > {link_grupo}
  >
  > **2) Aproveite e já troque sua foto de perfil pela moldura oficial da campanha** — ajuda muito a fortalecer nossa presença nas redes:
  > {link_foto}

- Se `linkGrupo` não existir para a região do coordenador:
  - O botão **continua funcionando**, mas envia só a parte da foto (mensagem reduzida) e mostra um aviso discreto no card "Foto de perfil da campanha": "Grupo da região {regiao} não configurado — peça ao administrador para incluir e o convite vai junto automaticamente".
- Ícone e label do botão atualizados para refletir o novo conteúdo (ex.: "Enviar boas-vindas + grupo + foto" / ícone `Send`).
- Tooltip também atualizado.

---

## Detalhes técnicos

- **Migration ordem**: criar `eleicao_garantir_token_indicador` → trigger → backfill → RPC `eleicao_listar_indicadores_team` → grants. Tudo em uma só migration.
- **Trigger idempotente**: `ON CONFLICT DO NOTHING` no índice parcial `eleicao_indicacao_tokens_indicador_ativo`.
- **RLS**: novas RPCs `SECURITY DEFINER` com `SET search_path = public`.
- **Tipos Supabase** regeneram após a migration; código novo usa cast `as any` enquanto isso.

## Arquivos tocados

- `supabase/migrations/<nova>.sql`
- `src/components/eleicao/IndicacoesPanel.tsx`
- `src/pages/IndicarPublico.tsx`
- `src/pages/PortalCoordenador.tsx`

## Fora do escopo

- Não criar botão novo "Convidar para o grupo" — o convite vira parte da mensagem do botão de foto.
- Não mexer em Dobradinhas, fluxo de contratados, custos ou árvore do time.
- Não criar nova tabela.
