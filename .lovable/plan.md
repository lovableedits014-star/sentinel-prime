## Diagnóstico real

O problema não parece ser apenas “a ponte externa caiu”. Pelo histórico do chat e pelo código atual, a instância ficou instável principalmente por uma combinação de mudanças feitas depois do banimento:

### 1. A proteção anti-ban foi esvaziada
No histórico, em 08/06 foi implementado cooldown anti-ban para limitar `create_instance` e `reconnect`.

Mas hoje o código está assim:

```ts
function checkReconnectCooldown(...) {
  // Cooldown anti-ban desativado a pedido do usuário — sempre permite.
  return { allowed: true };
}
```

Ou seja: o sistema ainda mostra estrutura de cooldown, contador diário e mensagens de proteção, mas na prática não bloqueia nada. Isso permite gerar QR/reconectar várias vezes seguidas, exatamente o comportamento que aumenta queda de sessão e risco de novo banimento.

### 2. “Gerar novo QR” / `create_instance` está destrutivo demais
Hoje, quando a ação `create_instance` roda para uma instância que já tem credencial, ela faz:

```ts
delete_instance
create_instance
fetchFreshQr -> reconnect
```

Isso significa que, para “gerar novo QR”, o sistema apaga a sessão anterior na ponte e cria outra. Se esse botão for usado para tentar resolver instabilidade, ele pode piorar o problema: derruba a sessão atual, força novo pareamento e aumenta a frequência de QR Code.

Esse é um dos motivos mais fortes para você sentir que “antes ficava dias conectado, agora não segura”: depois do banimento, o fluxo ficou mais voltado a recriar/reconectar sessão do que preservar a sessão já pareada.

### 3. Status “conectado” ainda não prova que a sessão está operacional
A tela de Status usa principalmente `instance_status`. A função de envio usa um preflight mais rígido.

Então ainda pode acontecer:

- Status WhatsApp: ponte responde `connected/open`
- Disparos: ao enviar, a sessão real não responde direito
- Sistema marca como `not_ready` ou `disconnected`

O diagnóstico anterior já identificou que o teste correto precisa ser operacional, não só status. A ponte pode dizer “connected”, mas a sessão Web WhatsApp estar inválida. O teste mais forte é consultar uma ação que exija sessão viva, como `chats`, antes de liberar disparo.

### 4. Webhook de status não está amarrado com segurança à instância
O webhook atual recebe `client_id` e token, mas depende do payload trazer `instance_id`. Se a ponte não mandar exatamente o UUID interno da nossa tabela, eventos `connected`, `ready`, `open`, `disconnected` podem ser ignorados.

Além disso, o webhook é configurado manualmente em alguns fluxos; depois de criar/recriar a instância, não há garantia forte de que o webhook foi reconfigurado automaticamente para a instância nova.

Resultado: o banco pode ficar atrasado ou incoerente com o estado real da ponte.

### 5. Recriação/deleção de instância atrapalha rastreabilidade
O banco mostra a instância atual `Mayer` como conectada desde 04/07, com credenciais, mas `total_sent = 0` e logs recentes de `whatsapp_instance_send_log` vazios, enquanto existem disparos concluídos no histórico.

Isso indica que parte da rastreabilidade se perdeu ou não está sendo vinculada à instância atual, provavelmente por recriação/deleção de instância ou por logs não capturados quando o envio usa caminhos alternativos.

Sem logs confiáveis por instância, fica difícil provar exatamente se caiu por status falso, QR recriado, webhook ausente, erro da ponte, ou envio agressivo.

### 6. Existem políticas de envio arriscadas demais para um número já sensível
Na tela de Disparos existem modos como:

- Moderado: até cerca de 400 mensagens/hora
- Agressivo: até cerca de 600 mensagens/hora

Para um número que já foi banido e vive caindo, isso é alto risco. Mesmo se a instância estiver tecnicamente conectada, esse volume aumenta chance de bloqueio, logout ou instabilidade.

## Conclusão

O motivo mais provável é este conjunto:

```text
banimento anterior
  -> fluxo foi alterado para facilitar QR/reconnect
  -> cooldown anti-ban acabou desativado
  -> gerar QR passou a deletar/recriar sessão
  -> status superficial dizia conectado
  -> envio descobria sessão inválida só na hora
  -> usuário reconectava de novo
  -> ciclo de QR/reconnect se repetia
  -> sessão não permanecia estável por dias
```

Não encontrei evidência atual de “envio fantasma” rodando agora; o problema maior está no ciclo de sessão, status e reconexão.

## Plano de correção completo

### Fase 1 — Parar de derrubar sessão sem querer

1. Reativar o cooldown real anti-ban:
   - `create_instance`: mínimo 30 minutos entre tentativas
   - máximo 2 tentativas de novo QR por dia por instância
   - `reconnect`: mínimo 10 minutos entre tentativas manuais
   - bloquear tentativa repetida com mensagem clara

2. Trocar o comportamento do botão “Gerar novo QR”:
   - Não chamar `delete_instance` automaticamente se já existe credencial
   - Primeiro tentar `instance_status` + `reconnect` leve
   - Só permitir recriar sessão com confirmação explícita: “isso vai derrubar a sessão atual e exigir novo QR”

3. Separar os botões por intenção:
   - “Verificar” = somente leitura
   - “Reparar conexão” = tenta recuperar sem apagar sessão
   - “Gerar novo QR” = destrutivo, com cooldown e confirmação
   - “Desconectar” = destrutivo, manual

### Fase 2 — Criar uma verificação operacional única

Criar uma função interna única, por exemplo `verifyWhatsAppOperationalSession`, usada por:

- Status WhatsApp
- Disparos
- envio direto
- envio de credenciais eleitorais
- envio de novo líder
- sincronização de grupos

A verificação deve exigir:

```text
1. bridge_api_key existe
2. instance_status = connected/open
3. phone_number pareado existe
4. action chats responde com sucesso
5. sem suspected_banned_at
6. sem falhas consecutivas acima do limite
```

Se `instance_status` diz conectado, mas `chats` falha, o status deve aparecer como:

```text
Conectado na ponte, mas sessão WhatsApp não responde. Reconecte uma vez, sem gerar QR repetidamente.
```

### Fase 3 — Unificar Status e Disparos de verdade

1. Status WhatsApp deve usar a mesma verificação operacional do Disparos.
2. Disparos deve bloquear antes de criar/enfileirar envio se a sessão não passar no teste operacional.
3. O banner do Disparos deve mostrar o mesmo diagnóstico da tela Status.
4. Remover qualquer caminho antigo baseado só em `check_bridge` ou `instance_status` simples.

### Fase 4 — Corrigir webhook de conexão

1. Ao configurar webhook, incluir também `instance_id` na URL:

```text
/functions/v1/whatsapp-inbound-webhook?client_id=...&instance_id=...&token=...
```

2. No `whatsapp-inbound-webhook`, usar fallback:
   - primeiro `payload.instance_id`
   - se não vier, usar `instance_id` da URL

3. Após `create_instance` ou `reconnect` bem-sucedido, reconfigurar webhook automaticamente.
4. Corrigir também o fluxo de `reassign_instance`, que hoje reconfigura webhook sem token.
5. Registrar todos os eventos recebidos:
   - `connected`
   - `ready`
   - `open`
   - `disconnected`
   - `logout`
   - `banned`
   - payload sem `instance_id`

### Fase 5 — Preservar histórico e rastreabilidade

1. Parar de deletar o registro da instância quando trocar QR; marcar como “substituída” ou atualizar sem perder histórico.
2. Garantir que todo envio grave `whatsapp_instance_send_log`.
3. Capturar erros de `log_whatsapp_send`; hoje chamadas RPC podem falhar silenciosamente.
4. Criar ou reforçar um log de sessão com:
   - ação executada
   - usuário
   - instância
   - status antes/depois
   - resposta resumida da ponte
   - motivo da queda
   - se foi QR, reconnect, webhook ou envio

### Fase 6 — Ajustar política de envios para reduzir queda/banimento

1. Tornar “Furtivo/anti-ban” o padrão.
2. Bloquear ou esconder o modo “Agressivo” para número já banido/suspeito.
3. Colocar limite diário por instância.
4. Inserir aquecimento:
   - começar com poucos envios
   - aumentar gradualmente
   - pausas maiores e aleatórias
5. Para grandes volumes, priorizar a nova função de distribuição por coordenadores, reduzindo dependência de um único chip.

### Fase 7 — Recuperação controlada da instância atual

Depois da correção:

1. Reconfigurar webhook da instância atual com `client_id + instance_id + token`.
2. Rodar diagnóstico operacional.
3. Se falhar, fazer uma única reconexão manual.
4. Não gerar QR repetidamente.
5. Fazer teste com:
   - 1 envio para número próprio
   - depois 5 contatos
   - depois 20 contatos
6. Monitorar logs para confirmar se a sessão permanece conectada.

## O que eu revogaria das mudanças antigas

Eu revogaria ou mudaria estes pontos:

1. Cooldown anti-ban desativado.
2. “Gerar novo QR” deletando sessão automaticamente.
3. Status baseado só em `instance_status`.
4. Recriação de instância sem preservar histórico.
5. Modos de envio agressivos liberados para uma instância com histórico de banimento.
6. Webhook sem vínculo explícito com `instance_id` na URL.

## Resultado esperado

Com isso, o sistema passa a trabalhar assim:

```text
conectar uma vez
  -> webhook amarrado à instância
  -> verificação operacional real
  -> envio só se sessão responder de verdade
  -> sem QR/reconnect em loop
  -> logs completos de queda e envio
  -> políticas de disparo mais seguras
```

O objetivo é parar de “tratar sintoma” com QR novo e passar a proteger a sessão para ela voltar a durar dias conectada.