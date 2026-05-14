# Favoritos de grupos persistentes (sobrevivem à reconexão/recriação da instância)

## Diagnóstico

Hoje a tabela `whatsapp_groups` guarda o `is_favorite` por linha, e cada linha está amarrada à `instance_id` com `ON DELETE CASCADE` e chave única `(instance_id, group_jid)`.

Resultado: enquanto a instância apenas **desconecta**, o favorito sobrevive (a re-sincronização só faz upsert e preserva `is_favorite`). Mas quando a instância é **removida e recadastrada** (mesmo número, novo `instance_id`) — cenário comum quando o chip cai e o usuário precisa apagar/refazer a instância — o `CASCADE` apaga todos os grupos daquela instância junto com os favoritos. Aí, ao sincronizar de novo, tudo volta como “não-favorito”.

## Solução

Criar uma camada de favoritos **independente da instância**, indexada por `client_id + phone_number + group_jid`. Assim, qualquer instância futura com o **mesmo número de WhatsApp** reconhece automaticamente os grupos favoritados na próxima sincronização — sem o usuário precisar refavoritar um por um.

### 1. Nova tabela `whatsapp_group_favorites`

```text
client_id     uuid   (FK clients, CASCADE)
phone_number  text   (número do chip — normalizado, só dígitos)
group_jid     text   (JID do grupo no WhatsApp)
group_name    text   (último nome conhecido, só para UI/diagnóstico)
favorited_at  timestamptz
PRIMARY KEY (client_id, phone_number, group_jid)
```

Com RLS espelhando as políticas atuais de `whatsapp_groups` (dono + team_members ativos).

### 2. Sincronização entre as duas tabelas

- **Ao favoritar/desfavoritar** um grupo na UI (`toggleFavorite` em `useWhatsAppGroups.ts`):
  1. Continua atualizando `whatsapp_groups.is_favorite` (mantém compatibilidade do filtro atual).
  2. Também faz `INSERT`/`DELETE` em `whatsapp_group_favorites` usando o `phone_number` da instância dona daquele grupo.

- **Ao sincronizar grupos** (`action: "sync_groups"` no edge function `manage-whatsapp-instance`):
  - Depois do `upsert` dos grupos, executar um `UPDATE … SET is_favorite = true` em `whatsapp_groups` para todas as linhas dessa `instance_id` cujo `(phone_number, group_jid)` exista em `whatsapp_group_favorites`.
  - Isso restaura automaticamente os favoritos quando uma instância nova com o mesmo número é cadastrada e sincronizada pela primeira vez.

### 3. Backfill (uma vez, na migration)

Popular `whatsapp_group_favorites` com os favoritos atuais, juntando `whatsapp_groups` ↔ `whatsapp_instances` para pegar o `phone_number`. Garante que o que já está marcado hoje não se perca.

### 4. UI/UX — pequenas melhorias para deixar claro

- No painel de grupos (`Disparos.tsx` / `Eleicao.tsx`), mostrar uma pequena badge **“⭐ restaurado”** nos grupos cujo `is_favorite` foi reativado pela última sincronização (opcional, útil para o usuário entender que o sistema “lembrou”).
- No log de sincronização (já existe `pushLog` em `useWhatsAppGroups`), adicionar uma linha tipo:  
  `"⭐ N favorito(s) restaurado(s) para o número +55…"` quando o restore acontece.
- Se o usuário sincronizar uma instância de **outro número** que tem JIDs em comum, **não** restaurar (favoritos são por número, evita confundir chips diferentes).

### 5. O que NÃO muda

- A leitura/listagem continua a mesma (`whatsapp_groups` com `is_favorite`), então nenhum outro lugar do app que consulta favoritos precisa ser tocado.
- Estrutura de instâncias, dispatches, etc., permanecem iguais.

## Arquivos afetados

- **Migration nova**: criar `whatsapp_group_favorites` + RLS + backfill.
- `supabase/functions/manage-whatsapp-instance/index.ts` — após o upsert no `sync_groups`, aplicar restore baseado no telefone da instância.
- `src/hooks/useWhatsAppGroups.ts` — `toggleFavorite` grava nas duas tabelas; expor contador “restaurados” no log.
- (opcional) `src/pages/Disparos.tsx` / `Eleicao.tsx` — badge “restaurado” + linha no log.

## Ideias extras (posso incluir se quiser)

1. **Exportar/importar favoritos** entre números (ex.: trocou de chip e quer levar a lista junto) — botão “Copiar favoritos do número X para Y”.
2. **Grupos sugeridos**: marcar automaticamente como favorito grupos onde o número é admin há X dias.
3. **Histórico**: guardar `last_seen_at` em `whatsapp_group_favorites` para indicar “grupo favoritado mas não aparece desde 30 dias” (alerta de grupo perdido).

Quer que eu siga só com o essencial (tabela + restore automático + grava nas duas), ou já incluo alguma das ideias extras?
