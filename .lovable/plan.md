## Objetivo

Quando o cadastro de votos voluntários estiver desativado nas configurações, a área inteira no Portal do Coordenador deve ficar visualmente "apagada" (cinza, esmaecida), sem campos abertos para digitar, para não confundir o coordenador. Hoje aparece um banner âmbar mas os campos ainda ficam visíveis e parecem ativos.

## Mudanças (apenas UI, em `src/components/eleicao/VotosVoluntariosPanel.tsx`)

Quando `bloqueado === true`:

1. **Esconder os formulários de cadastro** (tanto o de coordenação quanto os de cada líder/cabo). No lugar deles, mostrar um placeholder cinza claro com cadeado:
   - Ícone de cadeado (`Lock`) em cinza
   - Texto: "Cadastro de votos voluntários temporariamente desativado"
   - Subtexto: "O administrador vai liberar esta área no momento certo. Por enquanto, você não precisa fazer nada aqui."
   - Fundo `bg-muted/40`, borda tracejada, texto `text-muted-foreground`

2. **Esmaecer a seção inteira** (o card do painel) com `opacity-60` e título em `text-muted-foreground`, para reforçar visualmente que está pausada.

3. **Listas de já cadastrados continuam visíveis** (apenas leitura) — útil para conferência, mas sem nenhum input/botão de "adicionar".

4. **Remover o banner âmbar atual** — o estado visual cinza + placeholder já comunica claramente; o âmbar dá sensação de alerta/erro, e o usuário pediu algo mais "apagado".

5. Manter o `disabled` nos pontos remanescentes (defesa em profundidade) caso algum botão de ação ainda apareça.

Nenhuma mudança de backend, banco ou regra — a RPC já rejeita cadastros quando desativado. Isso é puramente visual no portal do coordenador.

## Arquivos

- `src/components/eleicao/VotosVoluntariosPanel.tsx` (único arquivo alterado)
