Plano para resolver o `Internal server error` intermitente sem quebrar o sistema atual:

1. **Adicionar proteção real no SSR/servidor**
   - Criar uma entrada de servidor própria para capturar erros antes do app renderizar.
   - Registrar captura de erros globais e normalizar respostas 500 genéricas para uma tela HTML útil.
   - Ajustar `vite.config.ts` para usar essa entrada de servidor.
   - Motivo: hoje confirmei que não existe `src/server.ts`, não existe `src/start.ts` com middleware de erro, e o Vite não está usando uma entrada customizada. Quando algum módulo quebra durante SSR/dev proxy, o preview mostra apenas `Internal server error` sem diagnóstico claro.

2. **Adicionar fallback de erro no root do TanStack**
   - Incluir `errorComponent` em `src/routes/__root.tsx`.
   - Manter a SPA principal carregando só no cliente, mas com uma tela de erro recuperável caso algum componente falhe.
   - Botões: tentar novamente e voltar para a página inicial.

3. **Reduzir instabilidade do roteador interno**
   - Revisar `src/App.tsx`, porque o navegador mostrou este aviso confirmado: `Cannot update a component while rendering a different component (Transitioner/AppRouter)`.
   - A correção será pequena e focada: manter o histórico criado somente no cliente, sem causar atualização durante renderização.
   - Isso não é necessariamente a causa única do 500, mas pode contribuir para o preview ficar instável após HMR/alterações.

4. **Validar o preview de forma objetiva**
   - Abrir `/` no navegador automatizado.
   - Confirmar que a página renderiza sem `Internal server error`.
   - Verificar que não existem respostas 500 nem erros fatais no console.
   - Se o erro ainda aparecer somente no painel de preview do Lovable, usar o novo log capturado para identificar o módulo exato que está quebrando.

5. **Manter fora do escopo**
   - Não alterar regras de negócio do telemarketing, WhatsApp, missões ou banco.
   - Não refatorar rotas grandes agora.
   - Foco exclusivo: estabilidade do carregamento/preview e diagnóstico confiável de erro SSR.