# Trava de geração de Dossiê + Histórico

## Problema
Hoje o botão "Gerar / atualizar dossiê" em **Inteligência Eleitoral → Etapa 4 — Dossiê (Narrativa Política)** dispara o pipeline `coleta → analise → gerar` sempre que clicado. Isso:
- gera dossiês duplicados para a mesma cidade
- queima tokens das LLMs (OpenAI/Groq) à toa
- polui o "Histórico recente"

## Objetivo
1. **Travar** a geração quando já existe dossiê concluído para `client_id + UF + município`.
2. Permitir **regenerar de propósito** (override explícito, com aviso).
3. Manter um **histórico visível e organizado** das gerações.
4. **Limpar** o histórico atual (zerar a tabela `narrativa_dossies` do cliente para começar limpo).

## Mudanças

### 1. Banco (`supabase--migration`)
- **Limpeza** do histórico atual: `DELETE FROM narrativa_dossies` (todas as linhas — o usuário pediu para apagar tudo o que está lá).
- **Índice único parcial** para impedir duplicação no banco como segurança:
  ```sql
  CREATE UNIQUE INDEX narrativa_dossies_unique_ok
    ON narrativa_dossies (client_id, uf, municipio)
    WHERE status IN ('ok','gerado','concluido');
  ```
  (assim, mesmo se o front falhar, o banco bloqueia duplicata em estado válido)

### 2. Frontend — `src/components/inteligencia/narrativa/NarrativaPolitica.tsx`

**a) Lógica de trava**
- Calcular `dossieExistente = dossies.find(d => d.uf === uf && d.municipio === municipio && status concluído)`.
- Se existir e o usuário **não** marcou override:
  - Botão "Gerar / atualizar dossiê" fica **desabilitado**, com tooltip "Já existe dossiê para esta cidade — abra o histórico ou use 'Regerar'".
  - Aparece um aviso amarelo logo abaixo, com link "Ver dossiê existente" (foca no card) e botão secundário "Regerar mesmo assim".

**b) Confirmação de regeneração**
- Ao clicar "Regerar mesmo assim", abre `AlertDialog`:
  - Texto: "Isto vai sobrescrever o dossiê atual de {município}/{UF} e consumir novos tokens da LLM. Tem certeza?"
  - Confirmar → dispara `runPipeline.mutate({ uf, municipio, force: true })`.
- `runPipeline` passa a aceitar `force`. Antes de chamar `narrativa-coleta`, se `force=true` deleta o dossiê anterior (`supabase.from('narrativa_dossies').delete().eq(...)`) para liberar o índice único.
- Se `force=false` (padrão) e existir, aborta antes do invoke com toast informativo (defesa em profundidade caso o usuário burle o disabled).

**c) Histórico (mais útil)**
- A seção "Histórico recente" passa a mostrar **data de geração** + status, e cada item ganha:
  - botão de excluir (lixeira) → `delete` direto na tabela + invalidate da query.
- Lista cresce de 12 para 20 itens (já é o limite atual do query) e fica ordenada por `generated_at` desc.

### Diagrama do fluxo do botão

```text
Usuário escolhe UF + Município
            │
            ▼
  já existe dossiê concluído?
       │              │
      sim            não
       │              │
       ▼              ▼
  [Bloqueado]    [Gerar normal]
  + opção
  "Regerar mesmo
   assim" (dialog)
       │
       ▼
  delete antigo → coleta → analise → gerar
```

## Detalhes técnicos
- A constraint usa índice único parcial (não CHECK) — em linha com a regra do projeto sobre triggers/índices em vez de CHECK em colunas mutáveis.
- O `delete` antes do regerar é feito pelo client com a `service` do RLS (a tabela já tem policies por `client_id`, então o próprio usuário consegue).
- Sem alteração nas edge functions (`narrativa-coleta/analise/gerar`) — o controle fica no front + banco.
- Nenhum impacto em outros lugares: a tabela `narrativa_dossies` só é lida/escrita por este componente e pelas 3 edge functions citadas.

## Fora do escopo
- Não mexer no pipeline LLM (já discutido em mensagens anteriores).
- Não mexer em outras etapas da Inteligência Eleitoral.
- Não mexer no perfil do candidato.
