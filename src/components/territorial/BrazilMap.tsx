import { ComposableMap, Geographies, Geography } from "react-simple-maps";
import brazilGeo from "@/assets/geo/brazil-states.json";
import { ufName, ufRegion } from "@/lib/brazil-geo";
import { useState } from "react";

interface Props {
  /** Map of UF code → count of pessoas */
  data: Record<string, number>;
  /** Currently selected UF (highlighted) */
  selectedUF?: string | null;
  onSelectUF?: (uf: string | null) => void;
}

/** Choropleth map of Brazil. Color intensity reflects density of pessoas per state. */
export function BrazilMap({ data, selectedUF, onSelectUF }: Props) {
  const [hovered, setHovered] = useState<{ uf: string; count: number; x: number; y: number } | null>(null);

  const max = Math.max(1, ...Object.values(data));

  const colorFor = (uf: string) => {
    const v = data[uf] || 0;
    if (v === 0) return "hsl(var(--muted))";
    const ratio = v / max;
    // Use primary with variable opacity for choropleth feel
    if (ratio >= 0.75) return "hsl(var(--primary))";
    if (ratio >= 0.5) return "hsl(var(--primary) / 0.75)";
    if (ratio >= 0.25) return "hsl(var(--primary) / 0.5)";
    return "hsl(var(--primary) / 0.25)";
  };

  return (
    <div className="relative w-full">
      <ComposableMap
        projection="geoMercator"
        projectionConfig={{ scale: 700, center: [-54, -15] }}
        width={600}
        height={600}
        style={{ width: "100%", height: "auto" }}
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
                  strokeWidth={isSelected ? 2 : 0.6}
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

      {/* Legend */}
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
        Clique em um estado para filtrar cidades e bairros
      </p>
    </div>
  );
}
