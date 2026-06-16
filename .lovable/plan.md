## Diagnóstico

**Funciona:** RPC `eleicao_indicar_via_token` grava em `eleicao_indicados` e alimenta a view `v_eleicao_indicadores_cobranca` (usada na aba "Indicações" em /eleicao). O form do coordenador e o quick-add por linha no admin já chamam esse RPC.

**Por que parece quebrado:**
1. O coordenador cadastra e **não vê o que cadastrou** — só o contador muda. Sem lista visível, dá impressão que não salvou.
2. **Sem máscara de telefone** — usuário digita errado e recebe erro genérico ("Telefone inválido").
3. O coordenador **não consegue cadastrar voto voluntário em nome dos líderes/cabos dele** pelo portal — só no admin /eleicao.
4. O `IndicacoesPanel` admin **só atualiza com clique manual** — quem cobra não vê os números subindo em tempo real.
5. `_bairro: bairro || undefined` no payload pode ser ambíguo no Supabase-JS.

---

## Plano (Votos Voluntários continua no FIM da página, como pediu)

### 1. PortalCoordenador → `VotosVoluntariosPanel` (mantém posição no fim)
- **Mantém posição atual** (último card da página).
- **Form quick-add do próprio coordenador** continua dentro do card pessoal dele (já está), com melhorias:
  - **Máscara de telefone** automática `(DD) 9XXXX-XXXX`.
  - Validação em tempo real: botão "Cadastrar" só habilita com nome ≥ 2 chars + 10–11 dígitos.
  - Mensagens de erro específicas ("Faltou o DDD", "Limite diário atingido", "Já foi cadastrado").
  - Foco volta ao campo Nome após salvar.
- **Lista dos últimos 20 eleitores cadastrados pelo coordenador** (logo abaixo do form, dentro do card dele):
  - Nome, telefone, bairro, "há Xmin".
  - Linha recém-cadastrada com destaque verde pulsante por 2,5s.
  - Botão "Remover" (usa `eleicao_remover_indicacao_token` existente — funciona até 1h).
  - Carregada via novo RPC público `eleicao_listar_indicados_token(_token)`.
- **Botão "+ cadastrar em nome dele/dela" em cada linha de líder/cabo** do time (mesmo padrão do admin) → expande inline um form igual, registra usando o token daquela pessoa (não desloga, não troca de conta). Toast: "Cadastrado em nome de João ✓".

### 2. IndicacoesPanel admin (/eleicao)
- **Auto-refresh a cada 30s** enquanto a aba "Indicadores & Cobrança" está visível, para a pessoa que cobra ver os números subindo automaticamente.
- Pequeno texto "atualizado há Xs" no canto da lista.
- Sem alterar a estética nem o fluxo de cobrança em massa.

### 3. Limpeza técnica
- Trocar `_bairro: bairro || undefined` por inclusão condicional do campo (spread).
- `console.log("[VotosVoluntarios] indicar result", r)` em caso de retorno não-ok, para diagnóstico futuro.

### 4. Migração SQL (uma só)
Criar RPC público `eleicao_listar_indicados_token(_token text)` (SECURITY DEFINER) que retorna os últimos 50 indicados daquele token: `id, nome, telefone, bairro, created_at`. Validado por token apenas (sem auth) — mesmo padrão dos outros RPCs públicos da família `eleicao_indicar_via_token`.

---

## Arquivos
- **SQL (migração):** novo RPC `eleicao_listar_indicados_token`.
- **`src/components/eleicao/VotosVoluntariosPanel.tsx`** — reescrita com máscara, lista de últimos, remover, quick-add por linha do time.
- **`src/components/eleicao/IndicacoesPanel.tsx`** — auto-refresh 30s + indicador "atualizado há Xs" + payload limpo.

## Não vou mexer
- Posição do card de Votos Voluntários (fim da página, como você pediu).
- RPC `eleicao_indicar_via_token`.
- Estrutura de tabelas, view de cobrança, fluxo de cobrança em massa.
