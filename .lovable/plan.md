## Diagnóstico confirmado

O envio atual está preso no banco como `enviando`, com 25/30 enviados e 4 itens ainda `pendente`. A instância Mayer está `connected`, ativa e sem falhas consecutivas. Ou seja: não é falta de instância; o problema é que o processamento parou sem mudar o disparo para um status retomável.

A causa provável no código é uma combinação de:
- execução assíncrona em segundo plano (`waitUntil`) que pode encerrar sem finalizar o lote;
- pausas longas depois do envio/micro-pausas que podem consumir a janela da função;
- status `enviando` parado não entra na lógica de retomada manual/automática;
- o frontend não oferece `Pausar` e não mostra `Reenviar/Retomar` quando o status ainda está `enviando`, mas sem atualização recente.

## Plano de correção

### 1. Blindar o backend contra travamento

No `send-whatsapp-dispatch`:
- Antes de qualquer pausa longa entre mensagens, verificar se ainda há tempo seguro de execução.
- Se não houver tempo, salvar o progresso real no banco e trocar para `pausado_timeout`, com retomada automática.
- Depois de cada envio, atualizar `enviados/falhas/updated_at` imediatamente, não só a cada 5 mensagens.
- Se o usuário pausou manualmente (`pausado_manual`), o loop para sem marcar falha.
- Ao retomar, aceitar `pausado_manual`, `pausado_timeout`, `pausado_sem_instancia`, `pausado_janela` e também `enviando` antigo/travado.
- Ao finalizar, recalcular enviados/falhas diretamente pelos itens, para não ficar com contador divergente.

### 2. Criar controle manual no frontend

Na tela de Disparos:
- Adicionar botão `Pausar` ao lado de `Cancelar` quando um disparo estiver enviando.
- Adicionar botão `Retomar` quando estiver pausado.
- Adicionar botão `Reenviar` quando estiver `enviando`, mas sem `updated_at` recente e ainda houver pendentes.
- O botão `Retomar/Reenviar` chama a mesma função de resume e continua apenas os itens pendentes/cancelados retomáveis, sem reenviar os já enviados.

### 3. Tratar o envio travado agora

Após alterar e publicar a edge function:
- Reativar o disparo atual com os 4 pendentes usando o fluxo de resume.
- Confirmar no banco que ele saiu de 25/30 e finalizou ou ficou em uma pausa retomável correta.

### 4. Validação

Verificar:
- Instância continua `connected`.
- Disparo travado volta a processar os 4 pendentes.
- Botões `Pausar`, `Retomar/Reenviar` e `Cancelar` aparecem nos estados corretos.
- Nenhuma mensagem já enviada é reenviada por engano.
- Se a função precisar parar por tempo, ela fica em `pausado_timeout`, não presa em `enviando`.

## Fora do escopo

Não vou mexer em estratégia anti-ban, importação/exportação, mídia, teste de envio ou rotação de instâncias além do necessário para corrigir o travamento e os botões combinados.