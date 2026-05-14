## Diagnóstico

Pelo print da VPS e pelos logs do Supabase, a função `eleicao-notify-novo-lider` está chegando na ponte e a ponte devolve `status 200`, `delivered: true` e `messageId`. Ou seja: o app está chamando a VPS.

O ponto suspeito não é mais “não chamou a VPS”; é que este fluxo da aba Eleição usa uma implementação própria, diferente dos fluxos que funcionam. Ela faz seleção/preflight/verificação por um caminho separado e depois marca sucesso com base no retorno imediato da ponte.

Também identifiquei que:
- A instância usada é `Mayer Celular`, status `connected`.
- Os envios recentes foram gravados como sucesso para coordenador, secretaria e líder.
- A VPS mostra envio no log, mas isso pode ser apenas aceite/enfileiramento do Baileys, não garantia de chegada no WhatsApp.
- Os fluxos `send-whatsapp-dispatch` e `eleicao-send-credentials` usam padrões mais estáveis de seleção/preflight/envio.

## Plano de correção

1. **Unificar o motor da Eleição com o fluxo que já funciona**
   - Ajustar `eleicao-notify-novo-lider` para selecionar a instância usando `pick_healthy_whatsapp_instance`, igual ao sistema de Disparos/Credenciais.
   - Manter fallback para instância ativa, mas remover decisões divergentes que podem escolher uma instância errada ou recém-reconectada.

2. **Remover a verificação falsa que não existe na VPS**
   - Tirar a tentativa de `message_status/check_message/get_message_status`, porque essa VPS não suporta esse endpoint.
   - Voltar a tratar `messageId` como aceite da ponte, igual aos outros envios que funcionam, sem inventar confirmação inexistente.

3. **Enviar com o mesmo payload dos fluxos funcionais**
   - Usar exatamente `{ action: "send", phone, message }` para contatos individuais.
   - Logar o corpo essencial antes do envio: destinatário, telefone normalizado, instância e tamanho da mensagem.
   - Não expor chave/API key nos logs.

4. **Corrigir o registro de sucesso/falha**
   - Marcar como enviado somente quando a ponte devolver sinal aceito (`delivered: true` ou `messageId`).
   - Se a ponte aceitar, mas o usuário não receber, a investigação passa a ser do lado da VPS/WhatsApp Web, com log claro mostrando telefone, instância e messageId.

5. **Adicionar diagnóstico direto no retorno do modal**
   - O modal vai mostrar a instância usada, telefone final e `messageId`.
   - Em caso de erro real, vai mostrar o erro exato da ponte.

6. **Deploy e validação**
   - Redeploy da edge function `eleicao-notify-novo-lider`.
   - Verificar logs após o deploy para confirmar que a Eleição está usando o mesmo padrão dos fluxos que já funcionam.

## Arquivos que serão alterados

- `supabase/functions/eleicao-notify-novo-lider/index.ts`
- Possivelmente `src/components/eleicao/NotifyProgressDialog.tsx` apenas para melhorar a mensagem exibida, sem mexer no cadastro.

## Resultado esperado

Depois disso, a aba Eleição deixa de usar um caminho separado e passa a enviar pelo mesmo padrão dos envios que já funcionam. Se a VPS ainda mostrar “enviado” e o WhatsApp não entregar, teremos prova limpa de que o app entregou corretamente para a ponte e o problema está na sessão/fila/envio real da VPS.