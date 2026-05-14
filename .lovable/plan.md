## O que encontrei

- A função da aba Eleição está chamando a instância favoritada correta: `Whats Mayer Sentinelle`.
- Os três números agora estão diferentes e foram gravados corretamente nos logs.
- A VPS/bridge respondeu `200`, `success: true`, `delivered: true` e `messageId`, mas você não recebeu nada. Isso indica que o problema não é mais número repetido nem escolha da instância: é o endpoint da ponte aceitando o envio sem garantia real de entrega no WhatsApp.
- Isso é um caso conhecido em bridges baseadas em WhatsApp Web/Baileys: `messageId` pode significar “aceito/enfileirado”, não necessariamente “entregue no celular”.

## Plano de correção

1. **Parar de confiar só no retorno imediato da VPS**
   - A tela não vai mais mostrar “Pronto! Enviado” apenas porque recebeu `messageId`/`delivered` no retorno imediato.
   - O envio passará por uma etapa adicional de verificação depois do `send`.

2. **Adicionar confirmação pós-envio na função da Eleição**
   - Após enviar para coordenador, secretaria e líder, a função vai tentar consultar a ponte novamente usando o `messageId` retornado.
   - Vou suportar formatos comuns de bridge, por exemplo ações como `message_status`, `check_message`, `get_message_status` ou equivalente seguro, com fallback controlado.
   - Se a VPS não tiver endpoint de consulta de status, a resposta será marcada como “aceita pela VPS, mas não confirmada no WhatsApp”, não como entregue.

3. **Atualizar o modal para mostrar a verdade do fluxo**
   - Estados novos por etapa:
     - `Enviando...`
     - `Aceito pela VPS, verificando entrega...`
     - `Confirmado no WhatsApp`
     - `Não confirmado — tentar novamente ou ignorar`
   - Assim não teremos mais “sucesso falso”.

4. **Criar log detalhado para diagnóstico**
   - Gravar no log da Eleição:
     - telefone final enviado;
     - instância usada;
     - `messageId`;
     - resposta bruta resumida do envio;
     - resultado da verificação pós-envio;
     - motivo quando não confirmar.
   - Como a tabela atual não tem colunas para tudo isso, vou guardar o resumo dentro de campos já existentes quando possível para evitar migração agora. Se precisar de colunas novas depois, faço um plano separado.

5. **Comparar com envio manual/teste da instância**
   - Ajustar o payload da Eleição para ficar o mais próximo possível do envio direto usado em `manage-whatsapp-instance` e dos Disparos.
   - Se a ponte exigir outro campo além de `phone`/`message`, a função vai retornar esse detalhe no erro em vez de marcar como enviado.

6. **Validar com chamada real da Edge Function**
   - Redeploy da `eleicao-notify-novo-lider`.
   - Testar a função publicada.
   - Conferir logs da Edge Function e as tabelas `eleicao_notif_log` e `whatsapp_instance_send_log`.

## Arquivos que vou alterar

- `supabase/functions/eleicao-notify-novo-lider/index.ts`
- `src/components/eleicao/NotifyProgressDialog.tsx`

## Resultado esperado

A aba Eleição só mostrará envio confirmado quando houver confirmação real após o envio. Se a VPS aceitar mas o WhatsApp não entregar, o sistema vai parar na etapa com erro claro e botão para tentar novamente, em vez de dizer que enviou.