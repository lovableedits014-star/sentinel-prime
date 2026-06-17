## Objetivo

Na Central WhatsApp → Disparos:
1. Permitir enviar mensagem (texto + imagem) para **todos os cadastrados de uma região da Eleição** — incluindo "Moreninhas" e qualquer região que o cliente cadastrar.
2. Adicionar uma **política de envio "Furtivo"** com intervalos maiores e mais aleatórios, mais um modo **Personalizado** para o usuário definir os tempos.

A funcionalidade de anexar imagem já existe (`mediaUrl` é enviado ao backend). O filtro por região também já funciona no backend (`eleicao_regiao` no payload). O problema é só na UI: o seletor de Região está com lista **hardcoded** (só tem "Moreninha" singular, sem as regiões personalizadas do cliente).

---

## Alterações

### 1. `src/pages/Disparos.tsx` — Região dinâmica
Substituir a lista fixa de regiões de Campo Grande (linhas 603-621) por dados reais da tabela `eleicao_regioes` via hook `useRegioesEleicao(clientId)` (já existe). Isso fará aparecer "Moreninhas" e qualquer outra região cadastrada pelo cliente.

Também adicionar suporte ao escopo **Interior**: quando selecionado, exibir um campo de **município** (texto livre ou lista) para filtrar por `municipio` na tabela `eleicao_pessoas`. Hoje o escopo "interior" envia para todo interior sem refinamento.

### 2. `src/pages/Disparos.tsx` — Política "Furtivo" + Personalizada
Adicionar duas opções em `POLICIES`:

- **🥷 Furtivo (anti-ban)** — `batch_size: 5`, `delay_min: 25`, `delay_max: 90`, `batch_pause: 180` (~80 msgs/h, intervalos muito variados para não parecer bot).
- **⚙️ Personalizado** — abre 4 inputs numéricos onde o usuário define: tamanho do lote, delay mínimo (s), delay máximo (s), pausa entre lotes (s). Validações: `delay_max ≥ delay_min`, valores ≥ 1.

O payload já carrega `batch_size/delay_min/delay_max/batch_pause` para a edge function `send-whatsapp-dispatch`, então **nenhuma mudança no backend** é necessária para essa parte.

### 3. (Opcional, recomendado) Jitter adicional no worker
Verificar se a edge function `send-whatsapp-dispatch` já randomiza dentro de `[delay_min, delay_max]`. Se sim, nada a fazer. Se estiver usando média fixa, ajustar para `Math.random()` real entre os limites + um micro-jitter de 0-2s para imitar humano. (Confirmo isso na fase de build antes de mexer.)

---

## Fora do escopo

- Não vou criar tela nova de gerenciamento de regiões — já existe em outro lugar do app (Eleição). Aqui só consumimos a lista.
- Não vou mudar o fluxo de upload de imagem (já funciona).
- Não vou mexer no agendamento automático de cobrança.

---

## Validação

- Selecionar **Eleição → Campo Grande → Moreninhas**, anexar imagem, escrever texto → contagem de destinatários atualiza e disparo é criado.
- Escolher política **Furtivo** → enviar para 20 pessoas e confirmar nos logs que os intervalos ficam entre 25-90s.
- **Personalizado** com valores inválidos (delay_max < delay_min) → botão de envio bloqueado com mensagem clara.