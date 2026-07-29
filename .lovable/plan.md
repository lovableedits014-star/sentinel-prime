## Plano de correção do erro “campanha_id não existe” ao criar fila

### Diagnóstico confirmado
- O botão **Criar fila** chama a função do banco `tele_create_fila_wizard`.
- A função atual tenta inserir em `telemarketing_call_assignments` usando colunas que **não existem mais** nessa tabela: `campanha_id`, `pessoa_id` e `status`.
- A tabela real `telemarketing_call_assignments` hoje é usada para **travas temporárias de atendimento** e possui apenas: `client_id`, `tabela`, `contato_id`, `operador_nome`, `expires_at`, `created_at`.
- Por isso o erro reaparece na última etapa quando a origem é **Estrutura eleitoral**: a função tenta criar registros no lugar errado.

### Correção proposta
1. **Recriar a função `tele_create_fila_wizard` corretamente**
   - Manter a criação da campanha/fila em `telemarketing_campanhas`.
   - Para origem **Lista externa / Excel / CSV**, continuar criando a fila e importando os contatos via `tele_import_contato_avulso_batch`.
   - Para origem **Estrutura eleitoral**, em vez de inserir em `telemarketing_call_assignments`, atualizar os contatos elegíveis em `eleicao_pessoas` vinculando `campanha_id = nova_fila`.
   - Respeitar os filtros já escolhidos no wizard: cidade, bairro/região, tipo, apenas pendentes e substituir.

2. **Corrigir filtros com busca parcial**
   - O frontend envia cidade/bairro como `%texto%`.
   - A função atual compara com `=`, o que não funciona bem com esse padrão.
   - Ajustar para `ILIKE`, permitindo filtrar por cidade/região de forma mais tolerante.

3. **Evitar duplicidade e perda de contatos**
   - Quando “apenas não ligados” estiver ativo, não incluir pessoas que já têm ligação registrada.
   - Quando “substituir” estiver desativado, não roubar contato que já pertence a outra fila.
   - Quando “substituir” estiver ativado, permitir mover os contatos filtrados para a nova fila.

4. **Melhorar a mensagem de erro no wizard**
   - Trocar o toast cru do banco por mensagem mais clara: “Não foi possível criar a fila. Tente novamente; se persistir, me chame com o print.”
   - Continuar exibindo o detalhe técnico em modo discreto quando houver erro, para facilitar diagnóstico sem confundir.

5. **Validar o fluxo completo**
   - Criar uma fila de teste com origem **Estrutura eleitoral**.
   - Confirmar que a fila aparece em **Filas de ligação**.
   - Confirmar que o resumo da fila contabiliza os contatos via `tele_fila_summary`.
   - Confirmar que o portal do operador abre a fila sem depender de `telemarketing_call_assignments` para armazenar a campanha.

### Resultado esperado
- O botão **Criar fila** deixa de quebrar no último passo.
- A origem **Estrutura eleitoral** passa a criar fila usando o vínculo correto em `eleicao_pessoas.campanha_id`.
- `telemarketing_call_assignments` permanece só para travas temporárias, evitando novos erros recorrentes por coluna inexistente.