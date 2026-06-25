## Visão geral

Nova aba **"Distribuição de Contatos"** dentro de `/eleicao` que empacota os contatos de cada região e entrega ao coordenador principal num formato pronto para virar lista de transmissão. Sistema lembra o que já foi enviado e por padrão manda só os novos no próximo disparo.

## Localização

Aba nova em `src/pages/Eleicao.tsx` (ao lado das abas atuais). Toda a gestão fica concentrada nessa aba:
- Lista de regiões com coordenador principal e contadores
- Modal de envio do pacote
- Histórico de distribuições
- Configuração do template de mensagem

## Banco de dados

Migration nova:

**`eleicao_contato_lotes`** — cabeçalho do pacote enviado
- `client_id`, `regiao`, `coordenador_id` (pessoa_id do principal)
- `canal` (`instancia` | `manual_wa` | `download`)
- `total_contatos`, `apenas_novos` (bool)
- `mensagem_enviada` (texto que acompanhou)
- `whatsapp_dispatch_id` (FK opcional quando enviado pela instância — para puxar ack/leitura)
- `criado_por`, `created_at`

**`eleicao_contato_distribuicoes`** — itens (1 linha por contato no lote)
- `client_id`, `lote_id` (FK), `coordenador_id`, `pessoa_id`, `regiao`
- `enviado_em`
- UNIQUE (`coordenador_id`, `pessoa_id`) → garante anti-duplicidade lifetime

Ambas com GRANT + RLS por `client_id` (padrão do projeto). Tabela de template (`eleicao_distribuicao_template`) com `mensagem_template` editável por client.

## Fluxo principal (aba)

1. **Lista de regiões** — card por região mostrando:
   - Nome da região + coordenador principal (foto/nome/telefone)
   - Total de contatos elegíveis (líderes vinculados + avulsos + outros coordenadores + cabos eleitorais com telefone)
   - Badge **"🔔 X novos para distribuir"** quando há delta desde último envio
   - Última distribuição (data + canal)
   - Botão "Enviar pacote"

2. **Modal "Enviar pacote"**:
   - Resumo: coordenador destino, região, total elegível
   - **Novos: X** / **Já enviados antes: Y**
   - Toggle "Enviar somente novos" (padrão ligado) / "Reenviar todos"
   - Preview da mensagem (template renderizado com placeholders)
   - Preview da lista de contatos (tabela colapsável)
   - **3 botões de ação:**
     - 📲 **Enviar pela instância** (UAZAPI)
     - 🔗 **Abrir no WhatsApp Web** (link wa.me + download automático do .vcf)
     - ⬇️ **Baixar .vcf + CSV + PDF**

3. **Após qualquer envio**: cria lote + distribuições (UNIQUE bloqueia duplicidade automaticamente, mesmo se a pessoa estiver em 2 regiões).

## Geração de arquivos (client-side)

**`src/lib/eleicao-distribuicao-arquivos.ts`** — helpers puros:

- `gerarVCard(contatos, tagRegiao, campanhaNome)` → string vCard 3.0 com múltiplos `BEGIN:VCARD`, nome formatado `[TAG] Nome`, `NOTE` com campanha + data
- `gerarCsvGoogle(contatos, tagRegiao)` → CSV Google Contacts (UTF-8 BOM, vírgula, cabeçalho `Name,Given Name,Family Name,Phone 1 - Type,Phone 1 - Value,Group Membership,Notes`)
- `gerarPdfVisualizacao(contatos, tagRegiao, regiao)` → PDF 2 colunas, fonte grande, reaproveitando estilo de `eleicao-export-pdf.ts`

Download via `mobile-download.ts` já existente (compatível com iPhone).

## Envio pela instância (server function)

`src/lib/eleicao-distribuicao.functions.ts` com:

- **`enviarPacoteContatos`** (`requireSupabaseAuth`):
  1. Valida que o caller tem acesso ao client
  2. Monta lista de contatos (filtro "só novos" ou "todos")
  3. Gera .vcf in-memory
  4. Faz upload na UAZAPI como `document` e dispara `/send/media` para o telefone do coordenador
  5. Envia mensagem de texto antes (template renderizado)
  6. Cria `eleicao_contato_lotes` + `eleicao_contato_distribuicoes` (BULK insert com `onConflict: ignore` no UNIQUE)
  7. Salva `whatsapp_dispatch_id` para tracking de ack

- **`registrarPacoteManual`** (`requireSupabaseAuth`): mesma criação de lote/distribuições, sem disparar UAZAPI (usado pelos botões wa.me e download)

- **`listarRegioesDistribuicao`**: retorna por região `{ coordenador_principal, total_elegivel, total_novos, ultima_distribuicao }`

- **`listarContatosPacote`**: retorna preview dos contatos (com filtro novos/todos)

## Histórico

Sub-aba dentro de "Distribuição de Contatos":
- Tabela de lotes (data, região, coordenador, canal, qtd, status leitura se via instância)
- Drilldown: lista de contatos do lote
- Botão "Ver pendentes" volta pra distribuição com filtro

## Configuração

Card no topo da aba com:
- Editor do template de mensagem (textarea + placeholders `[coordenador_nome]`, `[regiao]`, `[qtd_contatos]`, `[campanha]`)
- Sugestão padrão pré-preenchida:
> Olá [coordenador_nome]! Segue em anexo a lista atualizada dos [qtd_contatos] contatos da região [regiao]. Importe na sua agenda e crie uma lista de transmissão para enviar sua mensagem individual de apresentação. Qualquer dúvida me chama!

## Implementação das sugestões aprovadas

1. **Espaçamento anti-ban**: ao disparar para múltiplos coordenadores em sequência (botão "Distribuir para todas as regiões pendentes"), backend agenda com delay de 30-60s aleatório entre envios.
2. **Confirmação de leitura**: server function `atualizarStatusLote` consulta UAZAPI pelo `whatsapp_dispatch_id` e atualiza coluna `status_leitura` no lote. Exibido como ícone ✓/✓✓/✓✓(azul) no histórico.
3. **Cron de sugestão**: pg_cron diário roda função `eleicao_sugerir_distribuicoes_pendentes` → cria alerta em `alertas` para regiões com >10 contatos novos não distribuídos. Aparece no `AlertasWidget` do dashboard.
4. **NOTE no vCard**: já incluído no gerador (`NOTE:Campanha {nome} - Distribuído em {data}`)
5. **Bloqueio de duplicidade**: garantido pelo UNIQUE `(coordenador_id, pessoa_id)` na tabela de distribuições. Tentativa de reenvio para mesmo par é silenciosamente ignorada (`onConflict: ignore`).

## Arquivos a criar/editar

**Migration:**
- Tabelas `eleicao_contato_lotes`, `eleicao_contato_distribuicoes`, `eleicao_distribuicao_template`
- RPC `eleicao_listar_regioes_distribuicao(client_id)` retornando contadores agregados
- Cron `eleicao_sugerir_distribuicoes_pendentes` (diário)

**Novos arquivos:**
- `src/components/eleicao/DistribuicaoContatosTab.tsx` (container da aba)
- `src/components/eleicao/DistribuicaoRegiaoCard.tsx` (card por região)
- `src/components/eleicao/EnviarPacoteDialog.tsx` (modal de envio)
- `src/components/eleicao/HistoricoDistribuicoesTab.tsx` (sub-aba histórico)
- `src/components/eleicao/TemplateMensagemCard.tsx` (config template)
- `src/lib/eleicao-distribuicao-arquivos.ts` (vCard + CSV + PDF)
- `src/lib/eleicao-distribuicao.functions.ts` (server functions)
- `src/hooks/useDistribuicaoContatos.ts` (queries)

**Editar:**
- `src/pages/Eleicao.tsx` — adicionar a nova aba

## Pontos confirmados

- ✅ Tudo em aba única dentro de `/eleicao`
- ✅ Implementar todas as sugestões adicionais (anti-ban, ack leitura, cron sugestão, NOTE no vCard, bloqueio duplicidade)
- ✅ vCard + CSV Google + PDF na primeira versão
- ✅ Template editável desde o início
