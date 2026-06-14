## Diagnóstico

O Alex (`alexescaramucafaria@gmail.com`) é `team_member` ativo do cliente, com `/eleicao` liberado. A RLS atual da tabela `eleicao_pessoas` deveria dar acesso total a tudo do client dele:

```
team can view eleicao  →  user_can_access_client(client_id)  OR  user_id = auth.uid()
```

Funciona pra você e para os outros team members. Mas pro Alex, quando ele expande o card do coordenador, a lista de líderes vem vazia — mesmo havendo líderes com `parent_id` apontando para aquele coord no banco.

Como **a UI não tem nenhum filtro por usuário** (o `load()` é um `select * from eleicao_pessoas where client_id = X` puro), só sobra um culpado: a leitura dos líderes está retornando 0 linhas pra sessão do Alex. Casos prováveis:

- Sessão dele em algum momento perde o JWT e o request vai como `anon` (nenhuma policy cobre anon → ele vê dados que já tinham vindo em cache, mas novos selects retornam vazio em parte das telas).
- Diferença de `auth.uid()` no momento da consulta (token expirando entre selects).
- Algum service worker antigo servindo um bundle desatualizado pra ele.

Em vez de continuar adivinhando, vou tornar a leitura desta tela **imune** a esse tipo de falha, usando um RPC `SECURITY DEFINER` que retorna todas as `eleicao_pessoas` do client quando o chamador tem acesso àquele client — assim qualquer team member ativo vê o mesmo conjunto, igualzinho ao que você vê.

## Plano

### 1. Migration: novo RPC `get_eleicao_pessoas_for_client`

- `SECURITY DEFINER`, `STABLE`, `search_path = public`.
- Recebe `_client_id uuid`.
- Verifica permissão chamando `public.user_can_access_client(_client_id)`; se falso, retorna conjunto vazio (ou levanta `insufficient_privilege`).
- Retorna `SETOF public.eleicao_pessoas` (todas as colunas, sem filtro por `tipo`).
- `GRANT EXECUTE ... TO authenticated`.

### 2. `src/pages/Eleicao.tsx`

- Trocar o `supabase.from("eleicao_pessoas").select("*").eq("client_id", clientId)` dentro de `load()` por `supabase.rpc("get_eleicao_pessoas_for_client", { _client_id: clientId })`.
- Manter o `order("created_at", { ascending: false })` aplicando ordenação no cliente após receber.
- Nenhuma outra mudança de UI — o resto do fluxo (filtros, edição, inserção, exclusão) continua usando os caminhos atuais com RLS.

### 3. Verificação

- Após aplicar: pedir ao Alex pra dar um hard-refresh (`Ctrl+Shift+R`) pra descartar service worker antigo.
- Confirmar com ele que, expandindo Paulo Henrique (região Imbiruçu), aparecem os líderes Maninho, Suzi de Almeida, Fabiana, Larissa, William, Vera, Valdinei, Otoniel, Adriana e Carlinhos.

### O que NÃO vou mexer

- RLS atual fica intacta (continua valendo pra INSERT/UPDATE/DELETE e pros outros pontos do app que leem a tabela).
- Portal do Coordenador, fluxo de cadastro, e demais telas seguem iguais.
- Sem mudança visual nem de comportamento pros outros usuários.