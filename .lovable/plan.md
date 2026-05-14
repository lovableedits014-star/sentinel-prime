Diagnóstico encontrado:
- A tela mostrou “Pronto!” porque a função recebeu HTTP 200 e `messageId` da ponte.
- No banco, o último teste registrou 3 envios como sucesso, mas todos foram para o mesmo número: coordenador, secretaria e líder estão resolvendo para `5567992422198`.
- A função da Eleição usa um fluxo próprio, diferente do fluxo mais maduro dos Disparos/Credenciais, então ela pode marcar “enviado” sem a mesma robustez de status, reconexão, atualização da instância e fallback.

Plano de correção:

1. Unificar a lógica de envio da Eleição com o fluxo que já funciona
- Substituir o envio interno da `eleicao-notify-novo-lider` pela mesma lógica usada em `eleicao-send-credentials`/`send-whatsapp-dispatch`:
  - seleção de instância ativa/favoritada;
  - preflight real;
  - atualização de status da instância;
  - retry em falha “Instance not connected”;
  - tratamento de falhas transitórias;
  - `log_whatsapp_send` consistente.

2. Melhorar a escolha da instância sem quebrar sua regra
- Priorizar a instância favoritada/primária quando estiver ativa e com credenciais.
- Se ela responder desconectada ou falhar no envio, marcar status corretamente e tentar reconectar antes de dizer que falhou.
- Só usar fallback se a favoritada realmente não puder enviar.

3. Parar de considerar sucesso “fraco” como envio confirmado
- Guardar no log a resposta bruta resumida da ponte quando possível.
- Só mostrar “Pronto! Enviado” quando a ponte retornar sinal confiável (`delivered`, `messageId`, `id` ou `key.id`) sem erro.
- Se a ponte devolver 200 mas sem confirmação confiável, mostrar erro com botão “Tentar novamente”.

4. Mostrar destinatários reais no modal
- Em vez de “Enviado para Coordenador”, exibir algo como:
  - “Enviando para Coordenador: Leiliane — 5567992422198”
  - “Pronto! Enviado para Secretaria — 5567992422198”
  - “Enviando mensagem para Líder: MAYER… — 5567992422198”
- Se dois ou três destinos tiverem o mesmo número, o modal deixa isso claro para não parecer que foi para pessoas diferentes.

5. Corrigir resposta por etapa
- Cada chamada com `target` retornará:
  - destinatário resolvido;
  - telefone limpo;
  - instância usada;
  - status do preflight;
  - resultado real do bridge;
  - erro detalhado quando falhar.
- O botão “Tentar novamente” repetirá a mesma etapa com os dados atualizados.
- O botão “Ignorar” continuará apenas pulando a etapa no cliente.

6. Validar depois da alteração
- Redeploy da função `eleicao-notify-novo-lider`.
- Testar com a função publicada usando a sessão autenticada.
- Conferir logs da Edge Function e tabelas `eleicao_notif_log` e `whatsapp_instance_send_log`.
- Confirmar que a tela não mostra sucesso falso quando não houver confirmação confiável.

Arquivos previstos:
- `supabase/functions/eleicao-notify-novo-lider/index.ts`
- `src/components/eleicao/NotifyProgressDialog.tsx`
- `src/pages/Eleicao.tsx` somente se precisar ajustar os dados passados para o modal.

Não pretendo mexer no cadastro de pessoas nem em outras abas de disparo.