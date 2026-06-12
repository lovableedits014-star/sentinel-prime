## Objetivo

Após concluir um **novo cadastro** (líder, coordenador ou cabo) na aba Eleição, abrir automaticamente um **popup de "Envio Manual"** que permita ao usuário do sistema disparar todas as mensagens do fluxo **pelo próprio WhatsApp Web** (clicando em links `wa.me`), sem depender da instância da campanha. Isso garante que mesmo se a instância estiver offline ou se o usuário preferir enviar manualmente (mais pessoal / mais entregável), ele tenha **um único lugar** com tudo pronto: mensagens redigidas, números corretos e botões "Abrir no WhatsApp".

A funcionalidade já existe parcialmente no menu de cada linha (`EnviarFluxoMenu` + `resolverFluxoCadastro`). O que falta é **abrir esse fluxo automaticamente no fim do cadastro**, num dialog maior e mais didático, com a opção também de incluir o **acesso ao portal** (no caso de coordenador).

## UX proposto

Após salvar um novo cadastro com sucesso (em `save()` do `Eleicao.tsx`), em vez de só fechar o dialog e dar toast, abre um novo dialog **`PosCadastroEnvioDialog`** com:

**Cabeçalho:**
- Título: "Cadastro concluído — enviar mensagens"
- Subtítulo: "Envie pelo seu próprio WhatsApp (sem usar a instância). Clique em cada botão para abrir a conversa com a mensagem pronta."
- Badge do tipo cadastrado (Líder / Coordenador / Cabo) + nome + região.

**Lista de cartões de envio** (cada um = 1 destinatário, com pré-visualização da mensagem em um `<details>` colapsável):

1. **Para o Cadastrado** (sempre) — boas-vindas + link do grupo da região.
2. **Para o Coordenador** (quando aplicável: novo líder com coordenador) — aviso "novo líder na sua região".
3. **Para a Secretaria** (quando configurada) — mesma notificação.
4. **Acesso ao portal** (somente coordenador) — card extra com e-mail + senha (default `coringa15111`, editável inline) e botão "Gerar link e enviar pelo meu WhatsApp" (usa `eleicao-send-credentials` com `channel: "link_only"` e injeta a mensagem retornada num `wa.me` para o telefone do coordenador). Mostra também botão "Copiar link" e "Copiar senha".

Cada cartão tem:
- Ícone (Crown / User / Building2)
- Nome + telefone formatado do destinatário
- Botão primário **"Abrir no WhatsApp"** (`wa.me/<phone>?text=<msg>`)
- Botão secundário **"Copiar mensagem"**
- Estado desabilitado com motivo (ex: "sem telefone", "sem coordenador favorito") reutilizando `FluxoDestino.disabled`

**Rodapé:**
- Checkbox **"Marcar como enviado"** (visual apenas, não persiste) — fica verde quando o usuário clica em "Abrir no WhatsApp".
- Botão **"Concluir"** fecha o dialog.
- Link discreto **"Eu já enviei pela instância automática — não preciso disso"** (fecha + lembra a escolha por sessão via `sessionStorage` para os próximos cadastros não abrirem o popup, com um botão pra reativar nas configurações da aba).

## Mudanças técnicas

### Novo: `src/components/eleicao/PosCadastroEnvioDialog.tsx`
- Props: `{ open, onOpenChange, pessoa: Pessoa, onPedirCredenciais?: () => void }`.
- Chama `resolverFluxoCadastro(pessoa)` no `useEffect` (com loading + erro).
- Renderiza os 3 cartões via os `FluxoDestino` retornados (`coordenador`, `cadastrado`, `secretaria`).
- Para coordenador: bloco extra **"Acesso ao portal"** que chama `sendCredentials(pessoa, "link_only", { email, password })` para obter `portal_url` + `message`; depois monta `wa.me/<telefone-do-coord>?text=<message>` e abre em nova aba.
- Estado local de "enviados" (Set de chaves) para feedback visual.

### `src/pages/Eleicao.tsx`
- Adicionar estado `posCadastroPessoa: Pessoa | null` e `posCadastroOpen: boolean`.
- No final de `save()` (após `load()`), quando `!editing` e `savedPessoa`, **substituir** os disparos automáticos atuais (`sendCoordBoasVindas`, `sendCaboBoasVindas`, `sendCredentials` automático) por: setar `posCadastroPessoa = savedPessoa` e `posCadastroOpen = true`. Os disparos automáticos **continuam disponíveis** dentro do dialog (opcionais), mas não acontecem mais por padrão — o usuário decide. Exceção: o `NotifyProgressDialog` (Coordenador → Secretaria → Líder, automático via instância) continua para líderes **se o usuário marcar a opção "Também enviar pela instância"** (checkbox no topo do novo dialog, desligado por padrão).
- Respeitar `sessionStorage["eleicao:skip-pos-cadastro"]` — se setado, pula o dialog e mantém o fluxo automático antigo.
- Renderizar `<PosCadastroEnvioDialog ... />` no final do componente.

### Reaproveitamento
- `resolverFluxoCadastro` (já existe) — fonte única das mensagens.
- `eleicao-send-credentials` (já existe, channel `link_only`) — para gerar portal_url + mensagem do coordenador, sem disparar pela instância.
- `EnviarFluxoMenu` no menu da linha continua existindo (para reenvio posterior), mas pode ser ajustado para abrir o **mesmo** `PosCadastroEnvioDialog` em vez do submenu — assim a UX é consistente entre "logo após cadastrar" e "quero reenviar depois". Substitui o item "Reenviar fluxo de cadastro" também.

### Sem mudanças
- Edge functions: nada precisa ser deployado.
- Schema: nenhuma migração.
- Mensagens / templates: reaproveitadas (não duplicar).

## Critérios de aceitação

- Ao salvar um novo líder/coordenador/cabo, abre o popup com 1–3 cartões prontos + (se coordenador) card de acesso ao portal.
- Botão "Abrir no WhatsApp" abre `wa.me` em nova aba com a mensagem pré-preenchida e o número do destinatário correto.
- Coordenador: o card "Acesso ao portal" mostra senha default `coringa15111` editável, e o botão envia a mensagem completa (link + e-mail + senha) pelo WhatsApp do usuário do sistema — **sem alterar a senha já cadastrada** quando o coordenador já tem login (reusa a lógica `reset_password: false`).
- Disparos automáticos via instância **não acontecem mais por padrão** — só se o usuário marcar a checkbox "Também enviar pela instância". Isso resolve o problema atual de mensagens automáticas saindo sem controle.
- O dialog é editável: usuário pode fechar sem enviar, pode marcar "não mostrar de novo nesta sessão", e pode reabrir via item de menu da linha ("Enviar fluxo manual").
- `NotifyProgressDialog` (Coordenador → Secretaria → Líder, automático) só roda quando solicitado explicitamente.
