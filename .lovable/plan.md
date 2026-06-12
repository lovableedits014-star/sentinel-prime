## Diagnóstico confirmado

- Rafael Felipe está cadastrado como `cidade = Dourados`, `bairro = Dourados`, mas foi plotado dentro de Campo Grande porque a geocodificação está forçando Campo Grande/MS como padrão e ignorando a cidade do cadastro.
- 1 cadastro de outra cidade já está contaminado; 56 estão sem coordenada.
- A geocodificação precisa **respeitar a cidade real** de cada pessoa, e o mapa precisa **mostrar cada pessoa na sua própria cidade**, não jogar todo mundo em Campo Grande.

## Plano de correção

### 1. Geocoding fiel à cidade do cadastro
- A cidade enviada ao Google passa a ser **sempre a cidade do cadastro** (Campo Grande só é usado quando o campo cidade estiver vazio).
- O `components` filter usa a cidade + UF do cadastro (não mais Campo Grande fixo).
- A bounding box rígida de Campo Grande deixa de ser aplicada para cadastros de outras cidades — caso contrário Dourados nunca passaria na validação.
- Validação por camadas:
  1. País = BR
  2. UF = MS (ou a UF cadastrada, quando houver)
  3. Cidade do retorno bate com a cidade cadastrada (locality ou administrative_area_level_2)
  4. Se houver bairro, tenta confirmar; se não bater, marca `bairro_nao_confirmado` em vez de gravar ponto torto
- Se a cidade não bate, marca `city_mismatch` e não grava coordenada.

### 2. Corrigir registros já contaminados
- Limpar `lat/lng/geocode_status/geocoded_at` de qualquer cadastro cuja `cidade` não seja Campo Grande mas esteja com coordenadas dentro da bounding box de Campo Grande.
- Isso devolve Rafael Felipe (e similares) para a fila de geocodificação respeitando Dourados.

### 3. Mapa mostra todas as cidades
- O mapa de cobertura passa a plotar pessoas de **qualquer cidade** (Campo Grande, Dourados, Três Lagoas, etc.), cada uma na sua própria localização real.
- O zoom inicial se ajusta automaticamente para abranger todos os pinos quando houver pessoas fora de Campo Grande.
- Os ícones por tipo (coordenador, líder, cabo, liderado) continuam iguais — a única diferença é que agora aparecem na cidade correta.

### 4. Filtros e visão por cidade
- Acrescentar um seletor de **Cidade** no topo do mapa, com as opções:
  - Todas as cidades (padrão)
  - Campo Grande
  - Cada outra cidade que tiver pelo menos um cadastro
- Acrescentar KPIs por cidade no painel:
  - Total de pessoas por cidade
  - Coordenadores / líderes / cabos por cidade
  - Cidades com cobertura (pelo menos 1 coordenador) x cidades em lacuna

### 5. Painel de auditoria atualizado
- Os contadores deixam de tratar “fora de Campo Grande” como erro.
- Passam a existir os contadores:
  - Sem cidade
  - Sem bairro
  - Cidade divergente (Google trouxe cidade diferente da cadastrada → pendência)
  - Bairro não confirmado
  - Sem coordenada
- Lista de pendências mostra cidade, bairro, endereço e o motivo exato.

### 6. Formulários de cadastro
- Manter o campo Cidade visível e editável em todos os cadastros (Eleicao, Portal do Coordenador, NovaPessoaDialog).
- Default sugerido continua Campo Grande, mas o usuário pode alterar livremente para Dourados, Três Lagoas, etc.
- Garantir que ao alterar cidade/bairro/rua o gatilho do banco zere as coordenadas e recoloque na fila.

## Resultado esperado

- Rafael Felipe (Dourados) aparecerá no mapa **em Dourados**, com o pino do tipo correto.
- Coordenadores e líderes de qualquer cidade entram no mapa, na sua cidade real.
- Filtro permite olhar a equipe da cidade que você quiser.
- Nenhuma pessoa de outra cidade é arrastada para Campo Grande por padrão de geocodificação.