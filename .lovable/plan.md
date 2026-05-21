## Card de validade do token Meta no Dashboard

Adicionar um aviso visível no topo do Dashboard que mostra quantos dias faltam para o token da Meta expirar, com cores conforme a urgência e um botão para renovar.

### Estados visuais

- **Verde** (>30 dias): "Token Meta válido — X dias restantes"
- **Amarelo** (8–30 dias): "Token Meta expira em X dias — renove em breve"
- **Vermelho** (≤7 dias): "Token Meta expira em X dias — renove agora"
- **Vermelho** (vencido): "Token Meta vencido há X dias"
- **Cinza** (sem data salva): "Validade do token Meta desconhecida — reconecte para registrar a data"

Todos os estados incluem botão "Renovar token" que leva para `/integrations`.

O card só aparece se o cliente tiver integração Meta configurada (`meta_page_id` preenchido).

### Arquivos

1. **Novo:** `src/components/dashboard/MetaTokenStatusCard.tsx`
   - Recebe `clientId` como prop
   - Busca `meta_page_id`, `meta_token_expires_at`, `meta_token_type` da tabela `integrations`
   - Calcula dias restantes e escolhe variante (success/warning/destructive/muted)
   - Usa tokens semânticos do `src/styles.css` (`success`, `warning`, `destructive`)

2. **Editar:** `src/pages/Dashboard.tsx`
   - Importar `MetaTokenStatusCard`
   - Renderizar logo antes do alerta de "comentários sem análise" (linha ~581), passando `clientId`

### Sem mudanças no banco

A coluna `integrations.meta_token_expires_at` já existe e é populada pelo fluxo de conexão Meta. Integrações antigas que nunca tiveram o campo preenchido mostrarão o estado cinza até a próxima reconexão (comportamento intencional).
