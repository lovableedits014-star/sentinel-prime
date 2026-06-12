# Reformulação da aba Territorial — Mapa de Cobertura da Equipe

## Objetivo
Substituir (ou complementar) o mapa atual do Brasil por um **mapa de rua interativo da cidade** mostrando, com pinos coloridos, exatamente onde estão os coordenadores, líderes e cabos eleitorais cadastrados — para o cliente identificar **lacunas de cobertura por bairro/região** de forma visual.

## O que temos hoje
- `src/pages/Territorial.tsx` (1637 linhas): mapa SVG do Brasil (`BrazilMap.tsx`), agrupamento por cidade/bairro em listas colapsáveis, merge de localidades.
- Dados de equipe na tabela `eleicao_pessoas`: campos `tipo` (coordenador/lider/cabo), `regiao`, `cidade`, `bairro`, `rua`, `numero`, `endereco`. **Sem latitude/longitude.**
- Regiões customizáveis por cliente em `eleicao_regioes`.
- Conector Google Maps **não configurado** no projeto.

## Proposta

### 1. Nova sub-aba "Mapa de Cobertura"
Dentro da página Territorial, adicionar uma aba no topo:
- **Brasil (visão macro)** — mantém o que já existe.
- **Cidade (cobertura da equipe)** — **NOVA**, vira a aba padrão quando o cliente tem cidade-sede definida.

### 2. Mapa de rua da cidade
- Mapa Google Maps centralizado automaticamente na cidade com mais cadastros (ou na cidade-sede do cliente).
- **Pinos por papel**, cada um com cor/ícone próprio:
  - 🟣 Coordenador (maior, com raio de "área de atuação")
  - 🔵 Líder
  - 🟢 Cabo eleitoral
  - ⚪ Pessoa cadastrada (opcional, toggle on/off — pode virar heatmap pra não poluir)
- **Cluster de marcadores** (MarkerClusterer) pra não travar com milhares de pontos como no print do cliente.
- Click no pino → popup com nome, telefone, papel, região, botão "Ver perfil" e "WhatsApp".

### 3. Análise de lacunas (o grande valor pro cliente)
- **Overlay de bairros**: pintar bairros da cidade por densidade de líderes/coordenadores:
  - 🔴 Vermelho: bairro com pessoas cadastradas mas **sem nenhum líder/coordenador** → lacuna crítica.
  - 🟡 Amarelo: tem líder mas sem coordenador.
  - 🟢 Verde: cobertura completa.
- Painel lateral "Bairros sem cobertura" listando bairros vermelhos ordenados por nº de pessoas órfãs, com botão "Cadastrar líder aqui".
- KPIs no topo: total de bairros / com cobertura / sem cobertura / % de cobertura.

### 4. Filtros
- Por região (`eleicao_regioes`)
- Por papel (mostrar/ocultar coordenadores, líderes, cabos, pessoas)
- Toggle heatmap de pessoas
- Busca por nome/bairro com fly-to no mapa

### 5. Geocodificação dos endereços
Como não temos lat/lng salvos, precisamos geocodificar a partir de `rua + numero + bairro + cidade`:
- Adicionar colunas `lat numeric`, `lng numeric`, `geocoded_at timestamptz`, `geocode_status text` em `eleicao_pessoas` e `pessoas`.
- Server function (`createServerFn`) `geocode-pessoa` que chama Google Geocoding via gateway do conector.
- Geocodificar **on-demand** quando a pessoa é cadastrada/editada e em **batch** retroativo (botão "Geocodificar pendentes" no painel, processando em lotes com throttling pra respeitar quota).
- Cache: nunca regeocodificar se endereço não mudou.
- Para quem só tem bairro, usar centroide do bairro (com pequeno jitter pra evitar sobreposição).

## Detalhes técnicos

### Dependências e setup
1. Conectar o **conector Google Maps** (gateway Lovable) — geocoding via server, render do mapa via browser key `VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY`.
2. Carregar Maps JS API com `loading=async` + callback (sem `mapId`, usando `google.maps.Marker` clássico — conforme regras do conector).
3. `@googlemaps/markerclusterer` para clustering.

### Migração SQL
```sql
ALTER TABLE public.eleicao_pessoas
  ADD COLUMN lat numeric, ADD COLUMN lng numeric,
  ADD COLUMN geocoded_at timestamptz, ADD COLUMN geocode_status text;
CREATE INDEX eleicao_pessoas_geo_idx ON public.eleicao_pessoas (lat, lng) WHERE lat IS NOT NULL;
-- mesmas colunas em pessoas, se quisermos plotar a base CRM também
```

### Arquivos novos
- `src/components/territorial/CityCoverageMap.tsx` — mapa Google com pinos, cluster, overlay.
- `src/components/territorial/CoverageGapsPanel.tsx` — lista lateral de bairros sem cobertura.
- `src/components/territorial/CoverageFilters.tsx` — filtros e legenda.
- `src/lib/geocode.functions.ts` — `createServerFn` chamando Google Geocoding via gateway.
- `src/hooks/useCityCoverage.ts` — agrega pessoas/líderes/coordenadores e calcula gaps por bairro.
- `supabase/migrations/<ts>_geocode_eleicao_pessoas.sql`.

### Arquivos alterados
- `src/pages/Territorial.tsx` — envolver conteúdo atual em `<Tabs>` com nova aba "Cidade" como padrão.

## Entregáveis em ordem
1. Conectar Google Maps (eu vou pedir pra você conectar antes de implementar).
2. Migração + colunas lat/lng.
3. Server function de geocoding + botão batch.
4. Componente `CityCoverageMap` com pinos por papel e cluster.
5. Overlay de cobertura por bairro + painel de lacunas.
6. Filtros, busca e KPIs.
7. Integrar como nova aba na página Territorial.

## Pontos a confirmar antes de codar
1. **Conectar Google Maps agora?** (sem ele não dá pra usar o mapa estilo do print nem geocodificar — alternativa gratuita seria Leaflet + OpenStreetMap + Nominatim, mas com limite de 1 req/s no geocoding, ruim pra batch).
2. Manter o mapa do Brasil atual como aba secundária ou **substituir** totalmente pela visão da cidade?
3. Plotar também as pessoas comuns (CRM) no mapa ou só equipe (coordenador/líder/cabo)?
