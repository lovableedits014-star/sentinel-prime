# Trava de 30 dias no Dossiê (sem regeneração manual)

## Mudanças em `NarrativaPolitica.tsx`

### Comportamento quando já existe dossiê pronto para a cidade

**Remover:**
- Botão "Regerar mesmo assim"
- `AlertDialog` de confirmação de regeração
- Estado `regerarOpen` e a opção `force` em `runPipeline`

**Adicionar:**
- Cálculo de `diasDesdeGeracao` a partir de `generated_at || created_at` do dossiê existente.
- `liberadoEm = generated_at + 30 dias`, `diasRestantes = max(0, 30 - diasDesdeGeracao)`.
- Enquanto `diasRestantes > 0`:
  - Botão principal: **"Dossiê já gerado — sem informações novas"** (desabilitado, com ícone de cadeado).
  - Botão secundário em destaque: **"Abrir dossiê de {município}/{UF}"** → seta `activeDossieId` e faz scroll suave até o card de resultado.
  - Aviso amarelo abaixo dos botões:
    > "Já existe um dossiê pronto para {município}/{UF}, gerado em {data}. Os dados oficiais (IBGE, TSE, mídia) não mudam de um dia para o outro — não há informação nova a coletar. Um novo dossiê desta cidade será liberado em **{diasRestantes} dia(s)** ({data de liberação})."
- Quando `diasRestantes === 0` (passaram 30 dias):
  - Botão principal volta a ser **"Gerar dossiê"** normal e a geração roda como geração nova (apaga o dossiê anterior antes para liberar o índice único do banco e sobrescrever).

### Detalhes técnicos
- 30 dias = `30 * 24 * 60 * 60 * 1000` ms. Comparado contra `Date.now()`.
- O `delete` automático do anterior só acontece quando a trava de 30 dias já liberou — o usuário não consegue mais forçar manualmente.
- Sem mudanças no banco nem nas edge functions; o índice único parcial já criado continua válido.
- Sem mudança na seção "Histórico de dossiês gerados" (continua igual, com botão de excluir item).

## Fora do escopo
- Não alterar pipeline de coleta/análise/geração.
- Não alterar outras telas.
