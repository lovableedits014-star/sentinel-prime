# Migração de Google Maps → Leaflet + OpenStreetMap

## Objetivo

Substituir o Google Maps na aba **Territorial** por uma stack 100% gratuita, sem necessidade de cartão de crédito, que funcione em qualquer domínio (incluindo seu domínio customizado).

## Stack nova

| O que | Tecnologia | Custo |
|---|---|---|
| Renderização do mapa | **Leaflet** + tiles do OpenStreetMap | Grátis, sem cadastro |
| Marcadores agrupados | **leaflet.markercluster** | Grátis |
| Geocodificação (endereço → coordenada) | **Nominatim** (API pública do OSM) | Grátis, ~1 req/seg |

## O que muda visualmente

Praticamente nada do ponto de vista do usuário final:
- Mapa interativo (zoom, arrastar) ✅
- Marcadores coloridos por região com clusters ✅
- Popup ao clicar mostrando coordenador/líder/cabo eleitoral ✅
- Botão "Geocodificar pendentes" continua funcionando ✅

O estilo visual dos tiles muda (OpenStreetMap tem visual próprio, similar ao Google em estradas e bairros).

## Escopo (somente Territorial)

A migração **não toca** em outras partes do sistema. A função `geocode-tse-locais` (usada na Inteligência Eleitoral / Campo Grande) **já usa Nominatim/OpenStreetMap** — então essa parte já está livre do Google.

## Arquivos afetados

### 1. Frontend
- **`src/components/territorial/CityCoverageMap.tsx`** — reescrever para usar Leaflet em vez de `google.maps.Map`, `Marker`, `InfoWindow`. Trocar `MarkerClusterer` do Google pelo `leaflet.markercluster`.
- **`src/hooks/useGoogleMaps.ts`** — deletar (não será mais usado).

### 2. Backend (edge function)
- **`supabase/functions/geocode-eleicao-pessoas/index.ts`** — substituir as chamadas ao Google Maps Geocoding API por chamadas ao **Nominatim** (`https://nominatim.openstreetmap.org/search`). Mantém a mesma estrutura de fallback (rua → bairro → cidade) e os mesmos campos no banco (`lat`, `lng`, `geocode_status`, `geocode_precision`).
- Implementar respeito ao rate limit do Nominatim (1 req/segundo) com pequeno delay entre chamadas em lote.
- Enviar header `User-Agent` identificando a aplicação (exigência da política de uso do Nominatim).

### 3. Dependências
- Adicionar: `leaflet`, `react-leaflet`, `leaflet.markercluster`, `@types/leaflet`, `@types/leaflet.markercluster`
- Remover: `@googlemaps/markerclusterer`

## O que NÃO muda

- Estrutura do banco de dados (campos `lat`, `lng`, `geocode_status`, `geocode_precision` ficam iguais)
- Dados já geocodificados continuam válidos (coordenadas GPS são universais)
- Fluxo de cadastro de pessoas
- Inteligência Eleitoral / Campo Grande (já usa OSM)
- Aba Eleição, Mídia, etc.

## Cobertura Brasil — expectativa realista

- **Capitais e cidades médias**: cobertura excelente de ruas e bairros
- **Cidades pequenas**: cobertura boa, alguns nomes de rua podem faltar
- **Loteamentos muito novos**: pode não estar no mapa ainda
- Quando o Nominatim não achar a rua, o sistema cai para o bairro (igual hoje com o Google)

## Passos da implementação

1. Instalar dependências Leaflet e remover `@googlemaps/markerclusterer`
2. Reescrever `CityCoverageMap.tsx` com Leaflet (mesma UI, mesmos KPIs, mesma lógica de filtros e cores)
3. Reescrever `geocode-eleicao-pessoas` para usar Nominatim com rate limiting
4. Deletar `useGoogleMaps.ts`
5. Testar: abrir a aba Territorial e validar que o mapa renderiza, marcadores aparecem, clusters funcionam, geocodificar pendentes funciona

## Rollback

Se algo der errado, a migração fica isolada nesses 2-3 arquivos. Reverter é trivial. Os dados de geocodificação já existentes no banco continuam funcionando para qualquer mapa futuro.
