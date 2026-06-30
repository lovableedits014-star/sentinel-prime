## Objetivo
Criar um único **Grupo Interior** para todos os coordenadores e líderes cadastrados como `escopo = "interior"`, independente da cidade. Hoje o link do grupo (`grupos_links`) e o JID de rastreamento (`grupos_jids`) são por região — funciona pras regiões de Campo Grande, mas no interior cada município viraria um grupo, e a ideia é o contrário: um grupo só pra tudo do interior.

## Mudanças

### 1. Configurações de Eleição — UI (`src/components/eleicao/EleicaoConfigPanel.tsx`)
Adicionar um **card dedicado "Grupo Interior"** logo acima da lista de regiões, com os mesmos dois campos que cada região tem hoje:
- **Link de convite** (`https://chat.whatsapp.com/...`)
- **Grupo no WhatsApp (rastreamento)** — select dos grupos sincronizados

Esses valores são salvos no mesmo `grupos_links` / `grupos_jids` da `eleicao_notif_config`, usando uma chave reservada `__interior__`. Zero migração — é só uma chave nova dentro do JSONB existente.

### 2. Fluxo de cadastro client-side (`src/lib/eleicao-fluxo-cadastro.ts`)
Na resolução do `link_grupo` (passo 4), antes de cair na lookup por região:
- Se `p.escopo === "interior"`, usar `gruposLinks["__interior__"]` direto.
- Senão (Campo Grande), manter o comportamento atual de buscar por `regiaoValue`.

### 3. Edge function de notificação (`supabase/functions/eleicao-notify-novo-lider/index.ts`)
Mesma regra do item 2 na linha onde calcula `linkGrupo`. Garante que o template de boas-vindas enviado automaticamente ao novo coordenador/líder do interior já vem com o link do grupo único.

### 4. Rastreamento (grupos_jids)
Quando o sistema for rastrear participação em grupo de pessoas do interior, usar `grupos_jids["__interior__"]` em vez do JID por município. (Aplicar onde o código hoje resolve JID por região para escopo interior — pontos a verificar: `PortalCoordenador.tsx` e dashboards que cruzam `whatsapp_group_participants`.)

## O que NÃO muda
- A coluna `regiao` segue guardando o município no interior (pra continuar exportando vCard com a TAG da região e pra IA territorial).
- Regiões de Campo Grande continuam com link/JID próprio por região.
- Nenhuma migração de banco — só uso de chave reservada `__interior__` no JSONB que já existe.

## Resultado final
Você abre **Configurações → Eleição**, preenche uma vez o link do "Grupo Interior" e o JID de rastreamento, e todo coordenador/líder novo cadastrado como interior recebe automaticamente esse mesmo link no WhatsApp de boas-vindas — igual já acontece pras regiões de Campo Grande.