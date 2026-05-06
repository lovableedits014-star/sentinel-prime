import { ComposableMap, Geographies, Geography, ZoomableGroup, Marker } from "react-simple-maps";
import brazilGeo from "@/assets/geo/brazil-states.json";
import { ufName, ufRegion } from "@/lib/brazil-geo";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ZoomIn, ZoomOut, Maximize2, Target } from "lucide-react";

interface CityPoint {
  city: string;
  count: number;
  /** [lng, lat] */
  coords: [number, number];
}

interface Props {
  /** Map of UF code → count of pessoas */
  data: Record<string, number>;
  selectedUF?: string | null;
  onSelectUF?: (uf: string | null) => void;
  /** Optional city markers (shown when zoomed in / UF selected) */
  cities?: CityPoint[];
  onSelectCity?: (city: string) => void;
}

type View = { center: [number, number]; zoom: number };

const VIEW_BRAZIL: View = { center: [-54, -15], zoom: 1 };

// Centroides aproximados por UF (lng, lat) — usados para auto-zoom ao clicar no estado.
const UF_CENTROIDS: Record<string, [number, number]> = {
  AC: [-70.0, -9.0], AL: [-36.5, -9.6], AP: [-51.8, 1.4], AM: [-64.7, -4.1],
  BA: [-41.7, -12.5], CE: [-39.5, -5.5], DF: [-47.9, -15.8], ES: [-40.3, -19.2],
  GO: [-49.6, -16.0], MA: [-45.0, -5.4], MT: [-55.9, -12.6], MS: [-54.5, -20.5],
  MG: [-44.6, -18.5], PA: [-52.0, -4.0], PB: [-36.7, -7.1], PR: [-51.5, -24.5],
  PE: [-37.8, -8.5], PI: [-42.8, -7.5], RJ: [-43.0, -22.3], RN: [-36.6, -5.8],
  RS: [-53.5, -30.0], RO: [-63.0, -10.9], RR: [-61.4, 2.0], SC: [-50.5, -27.3],
  SP: [-48.6, -22.2], SE: [-37.4, -10.6], TO: [-48.3, -10.2],
};

/** Choropleth do Brasil com zoom/pan e foco automático no estado selecionado. */
export function BrazilMap({ data, selectedUF, onSelectUF, cities = [], onSelectCity }: Props) {
  const [hovered, setHovered] = useState<{ uf: string; count: number; x: number; y: number } | null>(null);
  const [view, setView] = useState<View>(VIEW_BRAZIL);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const max = Math.max(1, ...Object.values(data));

  // Auto-zoom no estado selecionado
  useEffect(() => {
    if (selectedUF && UF_CENTROIDS[selectedUF]) {
      setView({ center: UF_CENTROIDS[selectedUF], zoom: 4 });
    } else {
      setView(VIEW_BRAZIL);
    }
  }, [selectedUF]);

  const colorFor = (uf: string) => {
    const v = data[uf] || 0;
    if (v === 0) return "hsl(var(--muted))";
    const ratio = v / max;
    if (ratio >= 0.75) return "hsl(var(--primary))";
    if (ratio >= 0.5) return "hsl(var(--primary) / 0.75)";
    if (ratio >= 0.25) return "hsl(var(--primary) / 0.5)";
    return "hsl(var(--primary) / 0.25)";
  };

  const visibleCities = useMemo(() => {
    if (!cities.length) return [];
    // Mostra só quando zoom >= 2 (ou estado selecionado)
    if (view.zoom < 2 && !selectedUF) return [];
    return cities.slice(0, 200);
  }, [cities, view.zoom, selectedUF]);

  const cityMax = Math.max(1, ...visibleCities.map(c => c.count));

  const zoomIn = () => setView(v => ({ ...v, zoom: Math.min(v.zoom * 1.5, 16) }));
  const zoomOut = () => setView(v => ({ ...v, zoom: Math.max(v.zoom / 1.5, 1) }));
  const resetView = () => setView(VIEW_BRAZIL);
  const focusMS = () => setView({ center: UF_CENTROIDS.MS, zoom: 4 });

  return (
    <div ref={wrapRef} className="relative w-full">
      {/* Controles flutuantes */}
      <div className="absolute top-2 right-2 z-10 flex flex-col gap-1 bg-background/80 backdrop-blur-sm rounded-md border p-1 shadow-sm">
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={zoomIn} title="Aproximar">
          <ZoomIn className="w-3.5 h-3.5" />
        </Button>
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={zoomOut} title="Afastar">
          <ZoomOut className="w-3.5 h-3.5" />
        </Button>
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={resetView} title="Brasil inteiro">
          <Maximize2 className="w-3.5 h-3.5" />
        </Button>
        <Button
          size="icon"
          variant={selectedUF === "MS" ? "default" : "ghost"}
          className="h-7 w-7"
          onClick={focusMS}
          title="Focar Mato Grosso do Sul"
        >
          <Target className="w-3.5 h-3.5" />
        </Button>
      </div>

      <ComposableMap
        projection="geoMercator"
        projectionConfig={{ scale: 700, center: [-54, -15] }}
        width={600}
        height={600}
        style={{ width: "100%", height: "auto", maxHeight: "70vh" }}
      >
        <ZoomableGroup
          center={view.center}
          zoom={view.zoom}
          minZoom={1}
          maxZoom={16}
          onMoveEnd={({ coordinates, zoom }) => setView({ center: coordinates as [number, number], zoom })}
        >
          <Geographies geography={brazilGeo as any}>
            {({ geographies }) =>
              geographies.map((geo) => {
                const uf = geo.properties.UF as string;
                const count = data[uf] || 0;
                const isSelected = selectedUF === uf;
                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    fill={colorFor(uf)}
                    stroke={isSelected ? "hsl(var(--ring))" : "hsl(var(--border))"}
                    strokeWidth={isSelected ? 1.5 / view.zoom : 0.6 / view.zoom}
                    onMouseEnter={(e) => {
                      const rect = (e.currentTarget as SVGPathElement).getBoundingClientRect();
                      setHovered({ uf, count, x: rect.left + rect.width / 2, y: rect.top });
                    }}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => onSelectUF?.(isSelected ? null : uf)}
                    style={{
                      default: { outline: "none", cursor: "pointer", transition: "opacity 0.15s" },
                      hover: { outline: "none", opacity: 0.8, cursor: "pointer" },
                      pressed: { outline: "none" },
                    }}
                  />
                );
              })
            }
          </Geographies>

          {visibleCities.map((c) => {
            const r = 2 + (c.count / cityMax) * 6;
            return (
              <Marker key={c.city} coordinates={c.coords}>
                <circle
                  r={r / Math.sqrt(view.zoom)}
                  fill="hsl(var(--primary))"
                  fillOpacity={0.7}
                  stroke="hsl(var(--background))"
                  strokeWidth={0.5 / view.zoom}
                  style={{ cursor: onSelectCity ? "pointer" : "default" }}
                  onClick={() => onSelectCity?.(c.city)}
                >
                  <title>{c.city}: {c.count.toLocaleString("pt-BR")}</title>
                </circle>
                {view.zoom >= 4 && (
                  <text
                    textAnchor="middle"
                    y={-r - 1}
                    style={{
                      fontFamily: "system-ui",
                      fontSize: `${8 / Math.sqrt(view.zoom)}px`,
                      fill: "hsl(var(--foreground))",
                      pointerEvents: "none",
                    }}
                  >
                    {c.city}
                  </text>
                )}
              </Marker>
            );
          })}
        </ZoomableGroup>
      </ComposableMap>

      {hovered && (
        <div
          className="fixed z-50 pointer-events-none rounded-md border bg-popover px-3 py-2 shadow-lg text-xs"
          style={{ left: hovered.x, top: hovered.y - 8, transform: "translate(-50%, -100%)" }}
        >
          <p className="font-semibold">{ufName(hovered.uf)} <span className="text-muted-foreground font-normal">({hovered.uf})</span></p>
          <p className="text-muted-foreground">{ufRegion(hovered.uf)}</p>
          <p className="text-primary font-bold mt-0.5">{hovered.count.toLocaleString("pt-BR")} pessoas</p>
        </div>
      )}

      {/* Legenda */}
      <div className="flex items-center justify-center gap-3 mt-3 text-[10px] text-muted-foreground flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm" style={{ background: "hsl(var(--muted))" }} />
          <span>0</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm" style={{ background: "hsl(var(--primary) / 0.25)" }} />
          <span>Baixo</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm" style={{ background: "hsl(var(--primary) / 0.5)" }} />
          <span>Médio</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm" style={{ background: "hsl(var(--primary) / 0.75)" }} />
          <span>Alto</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm" style={{ background: "hsl(var(--primary))" }} />
          <span>Máximo ({max.toLocaleString("pt-BR")})</span>
        </div>
      </div>
      <p className="text-center text-[10px] text-muted-foreground mt-1">
        Use a roda do mouse ou os controles para dar zoom · clique no estado para filtrar
      </p>
    </div>
  );
}
