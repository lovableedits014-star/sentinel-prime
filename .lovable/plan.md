## Objetivo

Quando um **cabo eleitoral** for cadastrado, enviar automaticamente uma mensagem de WhatsApp pra ele com o convite pro grupo da região onde foi cadastrado (mesmo padrão que já existe pro coordenador).

## Mudanças

### 1. Banco (já aplicado)
- Coluna `template_cabo_boas_vindas` em `eleicao_notif_config` ✅

### 2. Edge function `eleicao-notify-novo-lider`
- Aceitar novo `target: "cabo_boas_vindas"`
- Validar que `pessoa.tipo === "cabo"`
- Resolver a **região** do cabo: usa `pessoa.regiao` se existir, senão sobe pela cadeia `parent_id` (líder → coordenador) até achar uma região
- Aplicar template (padrão: *"Olá {nome}! Você foi cadastrado como cabo eleitoral na região *{regiao}*. Entre no grupo da sua região: {link_grupo}"*)
- Enviar pro telefone do próprio cabo via `sendTo()` (mesma instância/preflight já usados)

### 3. `src/components/eleicao/EleicaoConfigPanel.tsx`
- Adicionar `template_cabo_boas_vindas` ao estado/save
- Novo `<Textarea>` na seção de templates, com placeholder padrão e variáveis disponíveis: `{nome}`, `{regiao}`, `{link_grupo}`

### 4. `src/pages/Eleicao.tsx`
- Após salvar pessoa nova com `tipo === "cabo"`, chamar a edge function com `target: "cabo_boas_vindas"` (igual ao `notifyCoordBoasVindas` já existente)
- `toast.success` informando que a mensagem foi enviada

## O que NÃO muda
- Fluxo de líder (continua com as 3 etapas via `NotifyProgressDialog`)
- Fluxo de coordenador (continua com boas-vindas próprias)
- Portal do Coordenador (mantém como está — pode ser tratado depois, se você quiser)
- Templates de líder/coordenador/secretaria (intocados)

## Edge case importante
Se a região do cabo não puder ser resolvida (nem direta, nem via parent) **ou** se não houver `link_grupo` configurado pra aquela região, a mensagem ainda é enviada, mas o `{link_grupo}` vai aparecer como *"(grupo não configurado)"* — mesmo comportamento atual do coordenador.
