# Corrigir erro de RLS no upload de imagem em Disparos

## Diagnóstico

O erro `new row violates row-level security policy` vem das políticas de INSERT no bucket `whatsapp-media` (Storage).

**Caminho do arquivo enviado** (`src/pages/Disparos.tsx`):
```
dispatches/{clientId}/{timestamp}-{rand}.{ext}
```

**Política atual** (migration `20260503132542...sql`):
```sql
CREATE POLICY "whatsapp-media client write"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'whatsapp-media'
  AND (storage.foldername(name))[1] = 'dispatches'
  AND public.is_client_member( ((storage.foldername(name))[2])::uuid )
);
```

**Função `is_client_member` atual:**
```sql
SELECT EXISTS (
  SELECT 1 FROM public.team_members
  WHERE client_id = _client_id AND user_id = auth.uid()
);
```

Ela só reconhece membros da `team_members`. **Não reconhece:**
1. O **dono do cliente** (`clients.user_id = auth.uid()`).
2. O **super admin** impersonando outro cliente (caso atual — você está logado como `lovableedits014@gmail.com` operando como "Junior Coringa").

Por isso o upload falha mesmo o usuário sendo legítimo.

## Plano de correção (migration única)

Atualizar `public.is_client_member` para retornar `true` também quando o usuário for:
- dono do cliente (`clients.user_id = auth.uid()`), OU
- super admin (`is_super_admin()`).

```sql
CREATE OR REPLACE FUNCTION public.is_client_member(_client_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    public.is_super_admin()
    OR EXISTS (SELECT 1 FROM public.clients      WHERE id = _client_id AND user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.team_members WHERE client_id = _client_id AND user_id = auth.uid());
$$;
```

### Impacto colateral (positivo)

Essa função é usada por várias outras políticas (storage de `campaign-frame-assets`, tabelas `llm_alerts`, etc.). Hoje, qualquer dono de cliente que não esteja também em `team_members`, e qualquer super admin impersonando, sofre o mesmo bloqueio silencioso. A correção alinha o comportamento ao restante do sistema, que já trata super admin e owner como autorizados em outras camadas.

### Verificação

1. Aplicar migration.
2. Em `/disparos`, anexar uma imagem JPG/PNG < 8MB → upload deve concluir e mostrar preview.
3. Enviar disparo de teste (não-grupo) com imagem → bridge recebe `send_media` com `media_url`.
4. Confirmar que grupos continuam ignorando imagem (regra já existente).

## Fora de escopo

- Nenhuma mudança em UI, edge function ou tipos. Só RLS.
- Permissões dos outros buckets ficam iguais — apenas ganham a mesma cobertura para owner/super-admin via função compartilhada.
