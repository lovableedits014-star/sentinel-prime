# Plano: Classificação de Sentimento Inteligente (Target vs Tema)

## Problema

A IA está classificando como **negativo** comentários como "É um absurdo isso" em posts que denunciam algo (ex: tirar polo da UEMS). O comentário está **concordando com o vereador** e criticando o **fato denunciado**, não o político. A IA não distingue entre:

- **Alvo do sentimento = candidato** → classificação real
- **Alvo do sentimento = fato/terceiro mencionado no post** → muitas vezes alinhado ao candidato

## Solução: Chain-of-Thought + Target Detection

### 1. Novo prompt com raciocínio obrigatório (analyze-sentiment)

Forçar a IA a responder **3 perguntas estruturadas antes** de classificar, retornando JSON expandido:

```json
{
  "post_stance": "denuncia|conquista|convite|opiniao|neutro",
  "target": "candidato|fato_do_post|terceiro|ambiguo",
  "alignment": "concorda|discorda|neutro",
  "s": "positive|neutral|negative",
  "c": 0.0-1.0,
  "reason": "1 frase curta"
}
```

Regra-chave nova no system prompt:

> Se `post_stance = denuncia/critica_a_algo` e `target = fato_do_post` e `alignment = concorda` (mesmo com palavras fortes como "absurdo", "vergonha", "revoltante"), então **POSITIVE** — o comentarista está apoiando a denúncia do candidato.

> Só classifique NEGATIVE se `target = candidato` E `alignment = discorda`. Em qualquer outro caso de dúvida sobre o alvo → NEUTRAL.

### 2. Contexto do post enriquecido

- Aumentar `post_message` de 200 → **500 caracteres**
- Incluir `post_stance` detectado uma vez por post (cachear em `posts.detected_stance`) para não recalcular a cada comentário
- Passar nome do candidato + cargo + cidade + partido para a IA entender o "lado" político

### 3. Verificador de negativos reformulado

O `verifyNegative` atual já existe mas usa o mesmo viés. Reformular para perguntar explicitamente:

> "O alvo da crítica é {candidato} ou é o problema que {candidato} está denunciando/abordando no post?"

Se o alvo é o problema e o post é uma denúncia → reclassifica para positive/neutral automaticamente.

### 4. Few-shot dinâmico melhorado

Hoje carrega 20 correções genéricas. Mudar para:
- 10 correções onde IA errou **negative → positive/neutral** (caso mais comum)
- 5 correções negative confirmados
- Filtrar por similaridade textual quando possível (mesmo cliente, posts parecidos)

### 5. Heurísticas atualizadas (`sentiment-heuristics.ts`)

Adicionar padrão: palavras fortes ("absurdo", "vergonha", "revoltante", "indignado") em post de **denúncia** do próprio candidato → não força negative.

Hoje qualquer "absurdo"/"vergonha" no texto vira negative direto via `DIRECT_NEGATIVE_PATTERNS`. Precisamos remover essa força quando o post sinaliza denúncia (ex: "defesa", "luta contra", "não podemos aceitar", "absurdo que").

### 6. UI: Reprocessar lote da aba Ranking Negativos

Na aba **Ranking Negativos** (Militância) adicionar:
- Botão "Reanalisar com IA melhorada" por militante (re-roda `analyze-sentiment` em todos os comentários negativos dele com o novo prompt)
- Botão global "Reanalisar todos os negativos do cliente" (chama `batch-analyze-sentiments` filtrando `sentiment='negative' AND sentiment_source='ai'`)
- Mostrar o `reason` da IA ao expandir o comentário (para o usuário entender por que foi classificado assim e corrigir com mais facilidade)

### 7. Aprendizado contínuo

A tabela `sentiment_corrections` já existe. Garantir que a cada reclassificação manual:
- Salva também o `post_message` completo
- Salva o `reason` que a IA tinha dado (novo campo `ai_reason`)
- A próxima análise no mesmo cliente usa esses como few-shot prioritários

## Arquivos afetados

**Backend (edge functions):**
- `supabase/functions/analyze-sentiment/index.ts` — novo prompt com chain-of-thought e detecção de target
- `supabase/functions/batch-analyze-sentiments/index.ts` — mesma lógica
- `supabase/functions/_shared/sentiment-heuristics.ts` — afrouxar gatilhos quando post é denúncia

**Banco:**
- `sentiment_corrections`: adicionar coluna `ai_reason TEXT` e `post_stance TEXT`
- `comments`: adicionar coluna `sentiment_reason TEXT` (opcional, para mostrar na UI)
- `posts`: adicionar coluna `detected_stance TEXT` (cache de stance do post)

**Frontend:**
- `src/pages/Militancia.tsx` (NegativeRanking): botão "Reanalisar" + exibir `sentiment_reason`
- Componente reutilizável "Reanalisar negativos" para usar também na aba Negativos de Comments

## Resultado esperado

Comentário "É um absurdo isso" no post da UEMS:

1. IA detecta `post_stance = denuncia` (vereador defendendo manter polo)
2. IA detecta `target = fato_do_post` (o absurdo é tirar a UEMS)
3. IA detecta `alignment = concorda` (apoia a defesa)
4. → Classifica como **POSITIVE** com `reason: "Apoia denúncia do candidato contra remoção da UEMS"`

## Perguntas antes de começar

1. Posso adicionar as 3 colunas novas (`ai_reason`, `sentiment_reason`, `detected_stance`)?
2. Quer que o botão "Reanalisar todos negativos do cliente" rode em batch agora (pode levar minutos e custar tokens) ou apenas sob demanda por militante?
3. Quer mostrar o "reason" da IA na UI também na aba Negativos de Comments, ou só na Militância?