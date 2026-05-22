## Objetivo
Adicionar um interruptor (Switch) em cada card de mensagem na aba **Eleição → Configurações**, para ligar/desligar o envio automático daquele template específico (coordenador interno, líder, boas-vindas coordenador, boas-vindas cabo). Se desligado, a mensagem automática não é enviada para aquele grupo.

## Mudanças

### 1. Banco (migration)
Adicionar 4 colunas booleanas em `eleicao_notif_config` (default `true`, para manter o comportamento atual):
- `envio_coordenador_ativo`
- `envio_lider_ativo`
- `envio_coord_boas_vindas_ativo`
- `envio_cabo_boas_vindas_ativo`

Observação: a chavinha geral `auto_enviar` continua existindo como "master switch".

### 2. UI — `src/components/eleicao/EleicaoConfigPanel.tsx`
- Adicionar os 4 campos ao state `Cfg` e ao `load()`/`save()`.
- No header de cada um dos 4 `Card` de mensagem, adicionar um `<Switch>` com label "Enviar automaticamente" / "Desativado".
- Quando desligado, o `<Textarea>` continua editável (só desativa o envio), e mostra um aviso sutil.

### 3. Edge function — `supabase/functions/eleicao-notify-novo-lider/index.ts`
Respeitar as novas flags antes de chamar cada `runXxx`:
- `runCoordenador` / `runSecretaria` (mensagem interna) → checa `envio_coordenador_ativo`
- `runLider` → checa `envio_lider_ativo`
- `runCoordBoasVindas` → checa `envio_coord_boas_vindas_ativo`
- `runCaboBoasVindas` → checa `envio_cabo_boas_vindas_ativo`

Quando desativado, registra `results.xxx = { sent:false, reason:"Envio desativado nas configurações", ... }` e não chama a bridge. Vale tanto para o fluxo completo quanto para chamadas com `target` específico.

## Resultado
Você pode, por exemplo, desligar só "Mensagem de boas-vindas para o cabo eleitoral" — ao cadastrar um cabo, ele não recebe WhatsApp, mas coordenador/líder continuam recebendo normalmente.