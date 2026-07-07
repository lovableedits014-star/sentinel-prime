## Bug
`send-whatsapp-dispatch/index.ts` linha 1075 declara `let currentStage = "maduro"` **dentro** do `while (attempt < MAX_ATTEMPTS)`. A linha 1381 (`stageMinDelayMs(currentStage)`), que roda **fora** desse loop após o envio, quebra com `ReferenceError: currentStage is not defined`. Resultado: apenas 1 destinatário é processado e o disparo inteiro vai para "Falhou".

Foi regressão introduzida na rodada P1+P2 quando adicionei o retry de failover para grupos.

## Correção (1 arquivo, cirúrgica)
`supabase/functions/send-whatsapp-dispatch/index.ts`:
1. Declarar `let currentStage = "maduro"` **antes** do `while` (junto de `attempt`), removendo a redeclaração `let` dentro do loop.
2. Nas 3 atribuições internas (linhas 1098, 1117, 1139) usar apenas `currentStage = ...` (sem `let`), o que já é o caso — só remover o `let` da declaração interna.

Nenhuma outra lógica muda. Redeploy da função.

## Validação
Refazer o disparo aos grupos: deve processar todos os destinatários e respeitar o delay do stage sem erro.