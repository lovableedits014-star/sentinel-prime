## Problema

No seu celular o site mostra a versão antiga porque uma versão antiga do **Service Worker** (`/sw.js`) foi instalada lá faz tempo. Em outros celulares que nunca tiveram aquela versão antiga, aparece tudo certo.

O `sw.js` atual (v5) já limpa caches quando ativa, **mas o navegador só substitui o SW antigo depois que a página é totalmente fechada/recarregada**, e a página que já está aberta continua servida pela versão velha. Resultado: você abre, vê o conteúdo antigo, e o novo só aparece "uma visita depois". Em iOS/Android, como o usuário muitas vezes não fecha a aba, ele nunca chega a essa "próxima visita".

Também não há nenhum sinal visual avisando que tem uma nova versão pronta, nem uma forma rápida do usuário forçar a atualização.

## O que vou fazer

Mudanças apenas no front-end / service worker (sem mexer em regras de negócio):

1. **`public/sw.js`** — bump para `v6` e, no `activate`, **após** limpar caches e fazer `clients.claim()`, navegar/recarregar todas as abas controladas (`client.navigate(client.url)`). Assim, no primeiro acesso do dia o SW novo assume e a página se atualiza sozinha, sem o usuário precisar fechar a aba.

2. **`src/main.tsx`** — melhorar o registro do SW:
   - Chamar `registration.update()` no `load` e a cada vez que a aba volta a ficar visível (`visibilitychange`), para o navegador checar `/sw.js` com mais frequência (hoje pode demorar até 24h).
   - Escutar `navigator.serviceWorker.addEventListener("controllerchange", ...)` e fazer um `window.location.reload()` único quando o SW novo assumir — fecha o ciclo do passo 1 mesmo em navegadores que não respeitam o `client.navigate`.
   - Escutar `updatefound` + `statechange === "installed"` e mostrar um pequeno toast "Nova versão disponível — Atualizar" (botão que faz `reload`). Serve como rede de segurança para qualquer outro usuário no futuro.

3. **Rota de emergência `?sw=off`** em `src/main.tsx`: se a URL tiver `?sw=off`, desregistrar todos os SWs e limpar `caches`, depois redirecionar para `/`. Assim, se algum dia outro usuário travar de novo, basta mandar pra ele o link `https://seusite/?sw=off` que ele "destrava" sem precisar de instruções técnicas.

4. **Para destravar especificamente o seu celular agora**, depois que essa versão estiver no ar:
   - Abrir `https://<seu-link>/?sw=off` uma vez (cai no passo 3 e limpa tudo).
   - Ou, equivalente: abrir o site em aba anônima uma vez — confirma que o conteúdo novo já está publicado — e depois recarregar a aba normal duas vezes.

## Arquivos alterados

- `public/sw.js` — bump de versão + reload dos clientes no `activate`.
- `src/main.tsx` — `update()` periódico, listener de `controllerchange`, toast de nova versão, suporte a `?sw=off`.

## Resultado esperado

- Seu celular (e qualquer outro com cache preso) passa a receber a versão nova automaticamente na primeira ou segunda abertura, sem precisar reinstalar nada.
- Daqui pra frente, toda vez que eu publicar uma alteração, os celulares já instalados vão se atualizar sozinhos em segundos — e quem não atualizar sozinho vê o aviso "Nova versão disponível".
- Você ganha o link `?sw=off` como "botão de emergência" pra qualquer apoiador que reclamar do mesmo problema.
