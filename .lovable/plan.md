
## Objetivo

1. Transformar o botão "Re-scan" da página **Status WhatsApp** em um atalho real: abrir um modal ali mesmo com o QR Code, sem precisar navegar até Configurações.
2. Remover o cooldown anti-ban que impede gerar novo QR (mensagem "aguarde ~29 min...").

## Mudanças

### 1. `src/pages/StatusWhatsApp.tsx`
- Adicionar estado `qrModalInstance` (instância selecionada) e um `<Dialog>` que exibe o QR.
- Ao clicar em **Re-scan**: abrir o modal e chamar `manage-whatsapp-instance` com a ação apropriada (`create_instance` com `force_recreate: true`) para essa instância, exibindo o QR retornado.
- Incluir botão "Atualizar QR" dentro do modal (regera) e polling curto para detectar quando conectar (fecha automaticamente e dá refresh na lista).
- Reaproveitar o mesmo componente/lógica de exibição de QR já usado em `WhatsAppInstanceCard` (extrair para um pequeno componente compartilhado `WhatsAppQrDialog` em `src/components/settings/` se necessário, ou renderizar inline com `<img src={qrDataUrl}>`).

### 2. `supabase/functions/manage-whatsapp-instance/index.ts`
Remover as travas de cooldown para operações de QR:
- Em `create_instance` / `force_recreate`: remover a verificação `checkReconnectCooldown` (ou fazê-la sempre retornar `allowed: true` para esta ação).
- Em `reconnect` / "Reparar": manter apenas um cooldown mínimo bem curto (ex.: 5s de anti-duplo-clique) ou remover totalmente conforme pedido.
- Remover contagem diária "máx 2 QR/dia".
- Manter apenas: logging da ação em `action_logs` (para termos rastro), sem bloquear.

### 3. `src/components/settings/WhatsAppInstanceCard.tsx`
- Remover/ocultar mensagens de "Proteção anti-ban: aguarde X min" já que a trava foi removida (ou mostrar apenas um toast neutro no caso raro de erro do bridge).

### 4. `.lovable/plan.md`
- Registrar reversão da política de cooldown de QR e a nova UX de Re-scan inline.

## O que NÃO muda
- Modo de envio (furtivo/agressivo), verificação operacional de sessão, webhook com `instance_id`, cooldown entre disparos — tudo isso permanece como está.
- Fluxo em Configurações continua funcionando; o modal em Status é apenas um atalho.

## Detalhes técnicos
- Payload do modal: `{ action: "create_instance", instance_id, force_recreate: true }` → resposta esperada contém `qr_code` (base64 ou URL). Reutilizar o parsing já existente no card de configurações.
- Polling: a cada 3s chamar `verifyWhatsAppOperationalSession` (ou o endpoint de status leve) enquanto o modal estiver aberto; fechar em `connected`.
- Aceito o trade-off de risco de banimento — o usuário quer controle total sobre quando reconectar.
