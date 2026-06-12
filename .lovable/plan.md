## O que muda na página Territorial

### 1. Tirar as duas chavinhas redundantes
No card de filtros do mapa (`CityCoverageMap.tsx`):
- **Remover "Mostrar liderados"** — quem decide o tipo é o filtro lateral (Coordenador/Líder/Cabo) já existente. Liderados deixam de aparecer no mapa por padrão; se um dia quiserem ver, basta adicionar `liderado` ao mesmo filtro de tipo.
- **Remover "Heatmap"** — pouco usado e dando erro (depende da lib `visualization` que não está sendo carregada). Some por completo, sem substituto.

O card de filtros fica só com: botões de tipo, busca por nome/bairro.

### 2. Geocodificação sempre coloca o pino — fallback inteligente

Hoje, quando o Google não confirma a rua ou o bairro, a pessoa fica sem coordenada e desaparece do mapa. Vai passar a funcionar em **3 níveis de precisão**, sempre tentando do mais exato para o mais aproximado:

1. **Rua exata** (rua + número + bairro + cidade) → pino normal (cor cheia, tamanho atual).
2. **Bairro** — se a rua não for encontrada ou não bater, tenta só `Bairro X, Cidade Y, MS`. Pino com borda tracejada/menor opacidade, indicando "posição aproximada no bairro".
3. **Cidade** — se nem o bairro for encontrado (ou não houver bairro), cai no centro da cidade. Pino ainda menor/mais translúcido com tooltip "localização aproximada — cidade".

Cada pessoa ganha um novo campo `geocode_precision` (`rua` | `bairro` | `cidade`) gravado junto com lat/lng. O status `geocode_status` continua existindo para auditoria (`ok`, `bairro_aproximado`, `cidade_aproximada`, `no_address`, `city_mismatch`).

Resultado: praticamente todo cadastro com cidade preenchida aparece no mapa. Só fica de fora quem realmente não tem nem cidade.

No InfoWindow do pino, mostrar um aviso quando a precisão for `bairro` ou `cidade`: "📍 Posição aproximada — endereço sem rua confirmada. [Editar cadastro]".

Os KPIs e o painel de qualidade passam a separar:
- **No mapa (rua exata)**
- **No mapa (aproximado por bairro)**
- **No mapa (aproximado por cidade)**
- **Sem cidade** (única categoria que realmente fica fora)

### 3. Editar cadastro direto do painel de pendências

No bloco "Qualidade dos dados" → "Ver pendências", cada linha ganha um botão **Editar** ao lado do badge de motivo. Clicar abre o `EditarPessoaDialog` já existente, pré-carregado com a pessoa. Ao salvar, dispara automaticamente o geocode daquele id (`supabase.functions.invoke("geocode-eleicao-pessoas", { body: { clientId, ids: [id], force: true } })`) e atualiza a query do mapa.

Isso fecha o loop: o usuário vê quem está com endereço ruim, corrige na hora e o pino aparece imediatamente.

---

## Detalhes técnicos

**Migração**
- `ALTER TABLE eleicao_pessoas ADD COLUMN geocode_precision text` (valores: `rua` | `bairro` | `cidade`).

**Edge function `geocode-eleicao-pessoas`**
- Reescrever `geocode()` para retornar `{ status, lat, lng, precision }`.
- Fluxo:
  1. Tenta endereço completo (rua+número+bairro+cidade) com `components` country/state/locality. Se vier `OK` com city match + bairro confirmado → `precision: 'rua'`.
  2. Se city match mas bairro não confere, ou se results vazios, refaz a chamada com `address = "Bairro X, Cidade Y, MS"`. Sucesso → `precision: 'bairro'`.
  3. Se ainda falhar, refaz com `address = "Cidade Y, MS"`. Sucesso → `precision: 'cidade'`.
  4. Só devolve `no_address`/`city_mismatch` se nem a cidade for resolvível.
- Status gravado: `ok` (rua), `bairro_aproximado`, `cidade_aproximada`, `city_mismatch`, `no_address`.

**`CityCoverageMap.tsx`**
- Remover `showLiderados` state + Switch.
- Remover `heatmap` state + Switch + bloco `HeatmapLayer`.
- `filteredPins` deixa de considerar `showLiderados` (se quiserem liderado, adicionam ao `activeTipos`).
- Renderização de pino usa `pinSvg(color, size, { precision })`:
  - `rua` → atual.
  - `bairro` → mesma cor, opacity 0.7, borda tracejada.
  - `cidade` → opacity 0.45, ícone menor com símbolo `~`.
- Adicionar import e estado para abrir `EditarPessoaDialog` a partir da lista de pendências; após `onSaved`, invocar geocode pontual e `qc.invalidateQueries`.

**Sem mudanças** em: filtro lateral de tipos, KPIs principais, painel de lacunas por bairro, fluxo de "Reprocessar tudo".

---

## O que o usuário precisa fazer depois
Clicar **Reprocessar tudo** uma vez para que as pessoas que estavam travadas em `city_mismatch` / `bairro_nao_confirmado` ganhem coordenada aproximada e apareçam no mapa.
