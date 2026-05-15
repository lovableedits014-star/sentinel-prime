## Diagnóstico

O cliente **Junior Coringa** existe e tem Meta configurado: página, Instagram e token estão presentes. Também já existem **1809 comentários** salvos para esse cliente.

O problema principal é de autorização/escopo:
- O gerente atual está em `team_members` do Junior Coringa, mas várias partes do app e das Edge Functions ainda aceitam apenas o dono em `clients.user_id`.
- A sincronização Meta falha com `403: Acesso não autorizado a este cliente` porque `fetch-meta-comments` verifica só `clients.user_id = usuário logado`.
- Algumas páginas ainda procuram cliente somente por `clients.user_id`, então para gerente aparecem vazias ou sem ações.
- As políticas RLS de tabelas importantes como `comments` e `integrations` também estão focadas no dono, o que pode fazer leitura/ações falharem para equipe.

## Plano de correção

1. **Criar uma função central de acesso ao cliente no banco**
   - Criar/usar uma função segura tipo `public.user_has_client_access(user_id, client_id)`.
   - Ela deve retornar verdadeiro quando o usuário for:
     - dono do cliente em `clients.user_id`, ou
     - membro ativo em `team_members`.
   - Usar `SECURITY DEFINER` para evitar recursão de RLS.

2. **Corrigir RLS das tabelas usadas no dashboard/Meta**
   - Atualizar políticas de `comments`, `integrations`, `supporters`, `supporter_profiles` e tabelas de apoio usadas no dashboard para permitir acesso também a membros ativos do cliente.
   - Manter dono e admin funcionando como antes.
   - Não abrir dados publicamente.

3. **Corrigir as Edge Functions de Meta e comentários**
   - Trocar verificações rígidas de dono por acesso via dono ou `team_members` em:
     - `fetch-meta-comments`
     - `test-meta-connection`
     - `generate-response`
     - `respond-to-comment`
     - `manage-comment`
     - `react-to-comment`
     - `batch-analyze-sentiments`
     - `analyze-sentiment`
     - `renew-meta-token`
   - Reaproveitar o guard compartilhado já existente (`_shared/auth-guard.ts`) onde fizer sentido.
   - Isso resolve o 403 da sincronização e das ações nos comentários para gerentes.

4. **Corrigir telas que ainda “puxam” só cliente do dono**
   - Aplicar fallback dono → membro ativo em páginas críticas:
     - `Comments.tsx`
     - `Integrations.tsx`
     - `StatusWhatsApp.tsx`
     - `Disparos.tsx`
     - `Territorial.tsx`
     - `Militancia.tsx`
     - `Midia.tsx`
     - `CalendarioPolitico.tsx`
     - componentes de IA/engajamento que ainda usam só `clients.user_id`
   - O `Dashboard.tsx` já começou a ser corrigido, mas precisa funcionar junto com RLS e Edge Functions.

5. **Adicionar um utilitário único de resolução de cliente no frontend**
   - Criar uma função/hook compartilhado para obter o cliente atual:
     - primeiro dono em `clients`,
     - depois vínculo ativo em `team_members`.
   - Substituir consultas duplicadas para evitar esse bug voltar em novas telas.

6. **Validar com dados reais do Junior Coringa**
   - Confirmar que o gerente `wellington.advogado2013@gmail.com` acessa o client_id `6879803f-fd2e-4a43-8d0d-4417e1b1fe15`.
   - Testar a Edge Function `fetch-meta-comments` com o token da sessão atual.
   - Validar que o dashboard lista os comentários existentes e que a sincronização não retorna mais 403.

## Resultado esperado

Depois da correção, gerente e novos usuários ativos em `team_members` vão conseguir:
- abrir dashboard com dados do cliente correto;
- sincronizar Meta do Junior Coringa;
- ver comentários já salvos;
- analisar sentimentos e executar ações em comentários;
- acessar as páginas liberadas sem depender de serem donos em `clients.user_id`.