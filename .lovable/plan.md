## Diagnóstico

Confirmei no banco com 3 casos que você citou:

| Pessoa | Cidade/Bairro | `lat` | `geocode_status` | Diagnóstico |
|---|---|---|---|---|
| Alex Barbaridade | Campo Grande / Jardim Santa Emília | `null` | `bairro_nao_confirmado` | rodou versão **antiga** da função |
| Gislaine Tlaes | Campo Grande / Jardim Seminário (Cristovão de Barros, 340) | `null` | `bairro_nao_confirmado` | rodou versão **antiga** |
| Rafael Felipe | Dourados / Dourados | `null` | *(nunca rodou)* | `geocoded_at = null` |

O status `bairro_nao_confirmado` **não existe** na nova edge function (que só grava `ok` / `bairro_aproximado` / `cidade_aproximada` / `no_address`). Conclusão: o código novo está no projeto, mas **a função não foi deployada** — quando você clicou "Reprocessar tudo", rodou a versão antiga e os pinos continuaram travados.

Além disso, o "Reprocessar tudo" hoje rodou e parou antes de chegar no Rafael (provavelmente por "stall" — quando a quantidade de pendentes não diminui em 2 rounds, o loop para e mostra aviso).

## O que vou fazer

### 1. Deployar `geocode-eleicao-pessoas`
Forçar o deploy da função (o código novo com fallback em 3 níveis já está commitado, só falta publicar).

### 2. Limpar status antigo + forçar reprocesso
Rodar uma migração curtinha pra zerar `geocode_status` de qualquer registro travado em status que não existe mais (`bairro_nao_confirmado`, `city_mismatch` antigo, etc.) — assim eles voltam a ter `lat IS NULL` "limpo" e o reprocesso pega.

```sql
UPDATE eleicao_pessoas
SET geocode_status = NULL, geocoded_at = NULL
WHERE lat IS NULL
  AND geocode_status NOT IN ('no_address','city_not_found')
  AND geocode_status IS NOT NULL;
```

### 3. Endurecer o loop "Reprocessar tudo"
Ajustar `CityCoverageMap.tsx` para não parar no primeiro stall:
- Aumentar tolerância de stall de 2 → 4 rounds.
- Quando detectar stall, em vez de parar, fazer um round com `force: true` para destravar registros que estão com `lat IS NULL` mas algum cache atrapalhou.
- Mensagem final mais clara: "X registros sem cidade reconhecível — abra Ver pendências para editar".

### 4. Default state não-hardcoded
Hoje o componente manda sempre `defaultState: "MS"`. Para registros de outras cidades fora de MS no futuro, vou priorizar o `estado` da própria pessoa quando preenchido (na edge function: usar `p.estado || defaultState` ao montar o endereço). Para Dourados/MS não muda nada agora, mas resolve já a expansão pra outros estados que você mencionou.

### 5. Validação pós-deploy
Depois de tudo, vou consultar de novo os 3 IDs (Alex, Gislaine, Rafael) e te mostrar:
- coordenadas obtidas
- `geocode_precision` (esperado: `bairro` para Alex e Gislaine, `cidade` para Rafael)

## O que você precisa fazer
Aprovar este plano. Não precisa clicar em nada — eu re-disparo o "Reprocessar tudo" via consulta direta pra confirmar antes de te entregar.
