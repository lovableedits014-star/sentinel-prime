## Problema

Quando o coordenador Cleber faz login no portal, ele está autenticado no Supabase. O componente `MateriaisDestaque` faz uma `SELECT` em `campaign_materials` filtrando por `status='published'`.

A tabela tem 5 políticas de RLS, mas a única que libera leitura pública (`public read published materials`) está restrita ao **role `anon`** (visitante deslogado). Os outros policies para `authenticated` exigem `user_can_access_client(client_id)` — e coordenadores não são membros da equipe (`team_members`) do cliente, então essa checagem falha.

Resultado: para o coordenador logado, a query retorna 0 linhas e o componente nem se renderiza (`if (items.length === 0) return null`). Na página pública (`/foto/:clientId`, `/galeria/:clientId`) funciona porque o visitante está como `anon`.

## Correção

Migration única, estendendo a leitura de materiais publicados a qualquer usuário autenticado (mesma regra do público, só que vale para os dois roles):

```sql
DROP POLICY "public read published materials" ON public.campaign_materials;

CREATE POLICY "anyone reads published materials"
ON public.campaign_materials
FOR SELECT
TO anon, authenticated
USING (status = 'published');
```

Isso não relaxa nada de fato: o material publicado já é público para visitantes deslogados via `/foto/...` e `/galeria/...`; só passa a ser visível também para usuários logados (coordenadores, apoiadores, etc.) consultando a mesma tabela.

A política existente `team read all materials` continua cobrindo rascunhos/arquivados para a equipe do cliente, então o painel admin não é afetado.

## Verificação

1. Reabrir o portal do coordenador (`/portal/coordenador/:clientId`) com sessão do Cleber → o card "Material de campanha" deve listar até 3 itens em destaque e o botão "Ver todos".
2. Botões **Baixar** e **WhatsApp** devem funcionar igual à página pública (o componente é exatamente o mesmo `MateriaisDestaque` + `PublicMaterialsTab` no diálogo).
3. Página pública `/foto/:clientId` e `/galeria/:clientId` (sem login) continuam funcionando normalmente.

## Arquivos

- Apenas 1 migração SQL nova em `supabase/migrations/` (criada pela ferramenta de migração — não escrevo manualmente).
- Nenhuma mudança em código frontend: o componente `MateriaisDestaque` já está corretamente conectado em `PortalCoordenador.tsx`.
