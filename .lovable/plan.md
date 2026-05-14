## Objetivo

Ao cadastrar um novo líder, exibir um painel visual mostrando, em tempo real, o status do envio de mensagem para cada destinatário (Coordenador → Secretaria → Líder), com botões de **Tentar novamente** e **Ignorar** por etapa em caso de erro.

## Mudanças

### 1. Edge Function `eleicao-notify-novo-lider` — modo single-target

Adicionar suporte ao parâmetro opcional `target` no body (`"coordenador" | "secretaria" | "lider"`). Quando enviado, a função executa **apenas a etapa solicitada** e retorna `{ success, result, preflight }`. Sem `target`, mantém o comportamento atual (envia tudo).

Isso permite ao frontend disparar cada etapa individualmente e oferecer retry/ignorar granular sem reescrever o fluxo do servidor.

### 2. Novo componente `NotifyProgressDialog` (frontend)

`src/components/eleicao/NotifyProgressDialog.tsx` — dialog modal exibido logo após salvar o líder. Contém:

- Lista de 3 etapas: Coordenador, Secretaria, Líder cadastrado
- Cada etapa mostra ícone de estado:
  - ⏳ pendente (cinza)
  - 🔄 enviando (spinner animado, "Enviando para Coordenador…")
  - ✓ sucesso (verde, "Enviado para Coordenador")
  - ✗ erro (vermelho, com mensagem)
  - ⊘ ignorada (cinza riscado)
- Em caso de erro: botões **Tentar novamente** e **Ignorar** ao lado da etapa
- Botão geral **Fechar** (habilitado quando todas as etapas terminam: success/skipped/ignored)
- Execução sequencial automática: dispara coordenador → aguarda → secretaria → líder. Se uma etapa falha, **pausa** o fluxo até o usuário escolher retry ou ignorar (depois continua para a próxima).

### 3. Integração em `src/pages/Eleicao.tsx`

Substituir o bloco atual de notificação automática (linhas ~241-291 da `save()`):
- Remover a chamada única ao endpoint que retorna tudo agregado
- Após inserir o líder, abrir o `NotifyProgressDialog` com `pessoaId`
- O dialog gerencia o ciclo de vida do envio chamando o endpoint com `target` para cada etapa
- Toast final consolidado quando o usuário fechar (apenas se houver falhas residuais)

Mantém o fluxo de coordenador + send_access intacto (não usa este dialog).

## Detalhes técnicos

- O endpoint usa o mesmo fetch direto autenticado (sessão Supabase) que já existe hoje
- Retry chama o mesmo endpoint com o mesmo `target` — sem mudança de estado do lado do servidor além do log normal de envio
- "Ignorar" é puramente client-side (marca a etapa como skipped e segue) — não chama o servidor
- Sem alterações de schema; não envolve migrations
- Usa tokens semânticos do design system (`--primary`, `--destructive`, `--muted`) e componentes shadcn já presentes (Dialog, Button, ícones lucide)

## Arquivos afetados

- `supabase/functions/eleicao-notify-novo-lider/index.ts` — adicionar branch `target`
- `src/components/eleicao/NotifyProgressDialog.tsx` — novo
- `src/pages/Eleicao.tsx` — substituir bloco de notificação por abertura do dialog
