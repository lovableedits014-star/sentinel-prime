// Brazil state utilities — UF codes, name normalization, region mapping.
// 100% local, no external APIs.

export const UF_LIST: { uf: string; name: string; region: string }[] = [
  { uf: "AC", name: "Acre", region: "Norte" },
  { uf: "AL", name: "Alagoas", region: "Nordeste" },
  { uf: "AP", name: "Amapá", region: "Norte" },
  { uf: "AM", name: "Amazonas", region: "Norte" },
  { uf: "BA", name: "Bahia", region: "Nordeste" },
  { uf: "CE", name: "Ceará", region: "Nordeste" },
  { uf: "DF", name: "Distrito Federal", region: "Centro-Oeste" },
  { uf: "ES", name: "Espírito Santo", region: "Sudeste" },
  { uf: "GO", name: "Goiás", region: "Centro-Oeste" },
  { uf: "MA", name: "Maranhão", region: "Nordeste" },
  { uf: "MT", name: "Mato Grosso", region: "Centro-Oeste" },
  { uf: "MS", name: "Mato Grosso do Sul", region: "Centro-Oeste" },
  { uf: "MG", name: "Minas Gerais", region: "Sudeste" },
  { uf: "PA", name: "Pará", region: "Norte" },
  { uf: "PB", name: "Paraíba", region: "Nordeste" },
  { uf: "PR", name: "Paraná", region: "Sul" },
  { uf: "PE", name: "Pernambuco", region: "Nordeste" },
  { uf: "PI", name: "Piauí", region: "Nordeste" },
  { uf: "RJ", name: "Rio de Janeiro", region: "Sudeste" },
  { uf: "RN", name: "Rio Grande do Norte", region: "Nordeste" },
  { uf: "RS", name: "Rio Grande do Sul", region: "Sul" },
  { uf: "RO", name: "Rondônia", region: "Norte" },
  { uf: "RR", name: "Roraima", region: "Norte" },
  { uf: "SC", name: "Santa Catarina", region: "Sul" },
  { uf: "SP", name: "São Paulo", region: "Sudeste" },
  { uf: "SE", name: "Sergipe", region: "Nordeste" },
  { uf: "TO", name: "Tocantins", region: "Norte" },
];

const NAME_TO_UF = new Map<string, string>();
for (const s of UF_LIST) {
  NAME_TO_UF.set(normalize(s.name), s.uf);
  NAME_TO_UF.set(s.uf.toLowerCase(), s.uf);
}
// Aliases comuns
NAME_TO_UF.set(normalize("Espirito Santo"), "ES");
NAME_TO_UF.set(normalize("Goias"), "GO");
NAME_TO_UF.set(normalize("Maranhao"), "MA");
NAME_TO_UF.set(normalize("Para"), "PA");
NAME_TO_UF.set(normalize("Paraiba"), "PB");
NAME_TO_UF.set(normalize("Parana"), "PR");
NAME_TO_UF.set(normalize("Piaui"), "PI");
NAME_TO_UF.set(normalize("Rondonia"), "RO"); 
NAME_TO_UF.set(normalize("Sao Paulo"), "SP");
NAME_TO_UF.set(normalize("Ceara"), "CE");
NAME_TO_UF.set(normalize("Amapa"), "AP");

export function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Resolve "SP", "São Paulo", "sao paulo" → "SP". Returns null if unknown. */
export function resolveUF(input: string | null | undefined): string | null {
  if (!input) return null;
  const t = input.trim();
  if (!t) return null;
  if (t.length === 2) {
    const upper = t.toUpperCase();
    if (UF_LIST.some(s => s.uf === upper)) return upper;
  }
  return NAME_TO_UF.get(normalize(t)) || null;
}

export function ufName(uf: string): string {
  return UF_LIST.find(s => s.uf === uf)?.name || uf;
}

export function ufRegion(uf: string): string {
  return UF_LIST.find(s => s.uf === uf)?.region || "—";
}
