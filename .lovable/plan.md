# Bloqueio de cadastros de Líderes e Cabos

## Objetivo
Permitir que o administrador controle, no painel **Eleição**, se coordenadores podem cadastrar **Líderes** e **Cabos eleitorais** no portal — com chave **global** (afeta todos) e **chave individual** por coordenador (para travar caso a caso quando o limite estourar).

## Mudanças

### 1. Banco de dados (migração)

**Tabela `eleicao_notif_config`** (controles globais — convive com a config existente):
- `cadastro_lider_ativo` boolean default true
- `cadastro_cabo_ativo` boolean default true

**Tabela `eleicao_pessoas`** (controles por coordenador):
- `pode_cadastrar_lider` boolean default true
- `pode_cadastrar_cabo` boolean default true

> Aplicáveis apenas a linhas com `tipo = 'coordenador'`. Para os demais tipos o valor é ignorado.

### 2. Painel admin — `src/pages/Eleicao.tsx` / `EleicaoConfigPanel.tsx`

**Card novo "Controle de cadastros" no `EleicaoConfigPanel`** (logo abaixo do card de notificações):
- Switch **"Permitir cadastro de novos Líderes"** (global)
- Switch **"Permitir cadastro de novos Cabos Eleitorais"** (global)
- Texto explicativo: quando desligado, nenhum coordenador consegue cadastrar; mesmo se a chave global estiver ligada, é possível travar individualmente abaixo.

**Por coordenador** — na listagem de pessoas (aba/lista de coordenadores em `Eleicao.tsx`), adicionar no menu de ações (DropdownMenu já existente) duas opções com toggle visual:
- "Permitir cadastrar Líderes" ✓/✗
- "Permitir cadastrar Cabos" ✓/✗

E um badge discreto ao lado do nome do coordenador quando algum dos dois estiver desligado (ex: "🔒 Líderes" / "🔒 Cabos"), para o admin enxergar rapidamente quem está bloqueado.

### 3. Portal do coordenador — `src/pages/PortalCoordenador.tsx`

No `load()`, buscar também:
- `eleicao_notif_config` do client (campos `cadastro_lider_ativo`, `cadastro_cabo_ativo`)
- Já tem o `me` (coordenador) — lê `pode_cadastrar_lider` / `pode_cadastrar_cabo`

Regras (calculadas no front, mas a barreira real é RLS — ver item 4):
- `permiteLider = config.cadastro_lider_ativo && me.pode_cadastrar_lider`
- `permiteCabo  = config.cadastro_cabo_ativo  && me.pode_cadastrar_cabo`

UI:
- Esconder/desabilitar botão **"Novo Líder"** quando `!permiteLider`, com tooltip "Cadastros temporariamente bloqueados pela administração da campanha".
- Mesma coisa para **"Novo Cabo eleitoral"** e o botão "Cabo deste líder" dentro do líder expandido.
- Banner discreto no topo do painel quando algum cadastro estiver bloqueado, com a razão (global vs. individual).

### 4. RLS — barreira real no banco

Atualizar a policy de **INSERT** em `eleicao_pessoas` para coordenadores: além das checagens atuais, exigir que o switch correspondente esteja ligado tanto em `eleicao_notif_config` quanto no próprio coordenador (`pode_cadastrar_lider` / `pode_cadastrar_cabo` conforme `tipo` sendo inserido). Isso garante que mesmo um request manipulado no front não passe.

## Detalhes técnicos

- **Migração** roda primeiro (precisa de aprovação do usuário). Defaults `true` para não quebrar fluxo atual.
- Tipos do Supabase (`src/integrations/supabase/types.ts`) serão regenerados automaticamente após a migração.
- `EleicaoConfigPanel.tsx` carrega/salva os 2 novos campos junto com os existentes — adicionar ao `interface Cfg`, `setCfg` inicial, leitura no `load()` e payload do `save()`.
- Atualização individual do coordenador: simples `UPDATE eleicao_pessoas SET pode_cadastrar_* = ... WHERE id = ?` via dropdown na lista de coordenadores.

## Fora de escopo
- Bloqueio com data/horário programado (pode entrar em iteração futura se quiser).
- Limites numéricos automáticos (ex: bloquear ao atingir N cabos) — por enquanto é manual via essas chaves.

## Pergunta antes de implementar
Confirma esses 2 pontos?
1. Quando você desligar a chave global, ela **sobrescreve** as individuais (ninguém cadastra), mesmo que alguém esteja individualmente liberado — correto?
2. Os defaults devem começar **ligados** (todos podem cadastrar até você desligar) ou prefere começar tudo **desligado** e ir liberando coordenador por coordenador?
