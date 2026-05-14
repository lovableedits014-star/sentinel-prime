Plano de correção urgente para os envios automáticos da aba Eleição

O que encontrei na investigação
- Os cadastros estão salvando no banco e o telefone está sendo padronizado corretamente.
- A função `eleicao-notify-novo-lider` foi chamada nos cadastros recentes e respondeu `200` com `success: true`.
- Os logs mostram `messageId` para os envios, mas o sistema hoje considera isso como “entregue”, sem validar melhor a saúde da instância antes do envio e sem registrar destinatário/erro detalhado por tipo de notificação.
- A função de líder está menos robusta que o fluxo de disparos gerais, que já possui pré-checagem da instância, tentativa de reconexão e tratamento mais forte de falhas.
- O frontend usa `supabase.functions.invoke`; isso já funcionou agora, mas é frágil para autenticação e erros detalhados. Já tivemos 401 antes por causa disso.

Correção que vou implementar

1. Fortalecer a chamada automática no frontend
- Trocar a chamada de `supabase.functions.invoke("eleicao-notify-novo-lider")` por `fetch` explícito com token atual da sessão.
- Parsear corretamente o corpo de erro da função.
- Mostrar no toast o resultado real por destinatário: coordenador, secretaria e líder.
- Não exibir sucesso genérico quando algum envio falhar ou for pulado.

2. Corrigir a função `eleicao-notify-novo-lider` na raiz
- Adicionar pré-checagem da instância WhatsApp antes dos envios:
  - consultar `instance_status`;
  - se estiver desconectada, tentar `reconnect`;
  - se continuar desconectada, retornar erro real e não sucesso falso.
- Usar a mesma lógica robusta do sistema de disparos que já funciona.
- Melhorar o tratamento da resposta da bridge:
  - `success:false` vira falha;
  - `delivered:false` vira falha;
  - ausência de confirmação clara vira aviso/falha controlada;
  - timeout/rede/502/503/504 terão retry curto.
- Logar cada envio com telefone, tipo de destinatário, status, erro e `messageId`.

3. Criar auditoria específica para a aba Eleição
- Criar uma tabela de log dos envios automáticos de eleição para rastrear:
  - pessoa cadastrada;
  - destinatário: coordenador, secretaria ou líder;
  - telefone enviado;
  - mensagem enviada;
  - sucesso/falha;
  - erro retornado;
  - `messageId`;
  - data/hora.
- Isso resolve o problema de hoje: o app diz “enviou”, mas não há uma tela/log claro dizendo exatamente para quem foi, qual mensagem e qual retorno.

4. Ajustar casos de vínculo do líder
- Quando o líder for cadastrado sem coordenador vinculado (`parent_id` vazio), manter o fallback por região, mas registrar claramente que foi usado fallback.
- Se não houver coordenador real na região, o sistema deve marcar `coordenador` como falha/pulado e não esconder isso.

5. Revisar também `eleicao-send-credentials`
- Padronizar a autenticação no frontend para envio de credenciais do coordenador.
- Garantir que erro da função apareça completo na tela.
- Manter o fluxo de criação de usuário e WhatsApp, mas com retorno mais transparente.

6. Teste final após correção
- Cadastrar um novo coordenador.
- Cadastrar dois líderes com telefones diferentes.
- Confirmar no banco:
  - telefones normalizados;
  - registros de log por destinatário;
  - status real de cada envio.
- Confirmar nos logs da função se houve preflight, tentativa de envio, `messageId` e resultado final.

Resultado esperado
- Se o WhatsApp realmente enviar, a aba vai mostrar sucesso por destinatário.
- Se a bridge aceitar mas não confirmar, a aba vai avisar corretamente.
- Se a instância estiver desconectada, o sistema tentará reconectar e mostrará o erro real.
- Não teremos mais “sucesso falso” nem envio automático sem rastreabilidade.