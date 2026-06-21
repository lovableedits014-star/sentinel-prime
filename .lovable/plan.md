Plano para corrigir a instância caindo e a divergência entre “status OK” e “disparo desconectado”:

1. Unificar a fonte de verdade do status
- Criar uma checagem única de “pronto para disparo” no backend, em vez de cada tela interpretar de um jeito.
- A tela de Status WhatsApp, Central WhatsApp e Disparos passarão a usar a mesma resposta: conectado, instável, desconectado, sem credencial, ou aguardando QR.
- O banner do Disparos deixará de dizer “Ponte configurada — pronto” quando existe apenas configuração salva, mas nenhuma instância realmente utilizável.

2. Corrigir a seleção da instância no envio
- Ajustar a função do banco que escolhe a instância saudável para não falhar por status antigo/inconsistente.
- Hoje o Status pode mostrar OK depois de uma checagem, mas o envio pode rejeitar porque a função exige `last_health_check_at` recente e outros campos específicos.
- O envio fará uma pré-checagem ao vivo antes de parar o disparo; só marcará desconectado quando a ponte confirmar estado terminal.

3. Melhorar estabilidade sem forçar reconexão perigosa
- Manter a regra de não reconectar automaticamente em loop, porque isso aumenta risco de bloqueio/banimento.
- Implementar uma rotina “keepalive leve”: checar status periodicamente, atualizar o banco e limpar estados antigos quando a ponte confirmar conexão.
- Tratar `connecting`, resposta vazia ou timeout curto como instabilidade temporária, não como queda definitiva.

4. Sincronizar as telas após ações manuais
- Depois de “checar status”, “reconectar” ou “gerar QR”, invalidar/refazer as consultas usadas também pelo Disparos.
- Na Central WhatsApp, ao trocar da aba Status para Disparos, o Disparos buscará o status real novamente.
- Mostrar no Disparos o motivo correto: “checando”, “instância instável”, “sem instância pronta”, “reconectar QR”, ou “pronto para envio”.

5. Corrigir inconsistências já existentes no banco
- Aplicar uma migration para revisar as funções `pick_healthy_whatsapp_instance` e `pick_healthy_instance_for_group`.
- Garantir que `connected_since`, `last_disconnected_at`, `last_health_check_at` e `consecutive_failures` sejam atualizados de forma coerente quando a instância volta ou cai.
- Evitar o caso atual onde uma instância pode ter sinais misturados, como `status = disconnected` mas `connected_since` ainda preenchido.

6. Melhorar diagnóstico para você ver o que aconteceu
- Registrar no log de envio se a instância foi rejeitada por status da ponte, credencial ausente, falhas consecutivas, health check antigo ou erro real de envio.
- Exibir no Status WhatsApp a diferença entre “conectado no banco” e “confirmado agora pela ponte”.

Arquivos/áreas a alterar:
- `supabase/functions/manage-whatsapp-instance/index.ts`: padronizar health check, readiness e reconexão segura.
- `supabase/functions/send-whatsapp-dispatch/index.ts`: usar readiness/preflight consistente antes de pausar disparos.
- Migration Supabase: ajustar funções de escolha de instância saudável e normalização de status.
- `src/pages/Disparos.tsx`: substituir `check_bridge` por status real de envio.
- `src/pages/StatusWhatsApp.tsx`: reaproveitar a mesma resposta e atualizar cache usado pelo Disparos.
- `src/hooks/useWhatsAppGroups.ts`: alinhar critérios de instância conectada se necessário.

Resultado esperado:
- Se o Status disser que está pronto, o Disparos também reconhecerá como pronto.
- Se o Disparos acusar problema, ele mostrará o motivo exato e não apenas “desconectado”.
- A instância deixará de ser marcada como caída por oscilações rápidas da ponte, sem aumentar risco de banimento por reconexão automática excessiva.