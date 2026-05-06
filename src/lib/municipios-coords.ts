// Lookup de coordenadas (lng, lat) de municípios brasileiros.
// Fonte: kelvins/municipios-brasileiros (IBGE).
import coords from "@/assets/geo/municipios-coords.json";

const MAP = coords as Record<string, [number, number]>;

function norm(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

/** Retorna [lng, lat] para uma cidade num UF, ou null se não encontrar. */
export function getCityCoords(city: string, uf: string): [number, number] | null {
  if (!city || !uf) return null;
  // remove sufixo " - UF" / ", UF" / "/UF" do nome bruto
  const clean = city.replace(/[\s,/-]+[A-Za-z]{2}\s*$/, "").trim() || city;
  const key = `${norm(clean)}|${uf.toUpperCase()}`;
  return MAP[key] || null;
}
