## Objetivo
Remover o agrupamento (bolinhas com números) do mapa da aba Territorial e exibir todos os pinos individualmente.

## Mudança
**Arquivo:** `src/components/territorial/CityCoverageMap.tsx`

- Remover o uso de `L.markerClusterGroup()` e do import `leaflet.markercluster`.
- Adicionar os marcadores diretamente ao mapa (`marker.addTo(map)` ou via `L.layerGroup`).
- Remover dependência `leaflet.markercluster` do `package.json` (não é mais usada).
- Manter intactos: popups, cores por tipo (Coordenador/Líder/Cabo), filtros, KPIs, link do WhatsApp e botão Editar.

## Observação
Com muitos pontos numa mesma cidade (centenas), pinos sobrepostos podem ficar visualmente densos. Se isso incomodar depois, podemos ativar um leve "spiderfy" só ao clicar, mas por padrão será tudo solto, como pedido.