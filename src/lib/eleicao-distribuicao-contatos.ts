// ============================================================
// Helpers para a aba "Distribuição de Contatos" (Eleição)
// Geração de vCard (.vcf), CSV (Google Contacts) e link wa.me.
// ============================================================

export interface ContatoExport {
  pessoa_id: string;
  nome: string;
  telefone: string;
  tipo?: string | null;
  bairro?: string | null;
}

const onlyDigits = (s: string) => (s || "").replace(/\D/g, "");

/** Aplica prefixo de TAG ao nome do contato (ex: "MOR - João"). */
export function aplicarTag(nome: string, tag: string): string {
  const t = (tag || "").trim();
  if (!t) return nome;
  // Evita prefixo duplicado caso o nome já comece com a tag
  if (nome.trim().toLowerCase().startsWith(t.toLowerCase())) return nome;
  return `${t} ${nome}`.trim();
}

function normalizePhoneForVcard(raw: string): string {
  const d = onlyDigits(raw);
  if (!d) return "";
  const full = d.startsWith("55") ? d : `55${d}`;
  // Formato padrão internacional E.164 (WhatsApp/Google aceitam)
  return `+${full}`;
}

function escapeVcardText(s: string): string {
  return (s || "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

// UID determinístico (FNV-1a 32-bit) — iOS Contacts deduplica/processa em lote por UID.
function uidForContato(c: ContatoExport): string {
  const seed = `${c.pessoa_id}|${c.nome}|${c.telefone}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  const hex = h.toString(16).padStart(8, "0").repeat(4); // 32 chars
  return `urn:uuid:${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** Gera UM vCard 3.0 individual — formato compatível com iOS 16+ em lote. */
export function gerarVcardIndividual(params: {
  contato: ContatoExport;
  tagPrefixo: string;
  regiaoLabel: string;
}): string {
  const { contato: c, tagPrefixo, regiaoLabel } = params;
  const tel = normalizePhoneForVcard(c.telefone);
  if (!tel) return "";
  const fullName = escapeVcardText(aplicarTag(c.nome || "", tagPrefixo));
  const noteParts = [
    regiaoLabel ? `Região: ${regiaoLabel}` : "",
    c.tipo ? `Tipo: ${c.tipo}` : "",
    c.bairro ? `Bairro: ${c.bairro}` : "",
  ].filter(Boolean);
  const linhas = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    "PRODID:-//Lovable//Eleicao//PT",
    `UID:${uidForContato(c)}`,
    `N:${fullName};;;;`,
    `FN:${fullName}`,
    `TEL;TYPE=CELL,VOICE:${tel}`,
  ];
  if (noteParts.length) linhas.push(`NOTE:${escapeVcardText(noteParts.join(" | "))}`);
  linhas.push("END:VCARD");
  return linhas.join("\r\n") + "\r\n";
}

/**
 * Gera vCard 3.0 com TODOS os contatos em um único arquivo.
 * Cards separados por linha em branco (CRLF duplo) — exigência do iOS Contacts
 * para reconhecer e oferecer "Adicionar todos os N contatos".
 */
export function gerarVcardLote(params: {
  contatos: ContatoExport[];
  tagPrefixo: string;
  regiaoLabel: string;
}): string {
  const { contatos, tagPrefixo, regiaoLabel } = params;
  return contatos
    .map((contato) => gerarVcardIndividual({ contato, tagPrefixo, regiaoLabel }))
    .filter(Boolean)
    .join("\r\n");
}



/**
 * Gera CSV no formato do Google Contacts (importação direta).
 * Colunas mínimas: Name, Given Name, Phone 1 - Type, Phone 1 - Value, Notes.
 */
export function gerarCsvGoogleContacts(params: {
  contatos: ContatoExport[];
  tagPrefixo: string;
  regiaoLabel: string;
}): string {
  const { contatos, tagPrefixo, regiaoLabel } = params;
  const header = [
    "Name",
    "Given Name",
    "Phone 1 - Type",
    "Phone 1 - Value",
    "Notes",
  ];
  const rows: string[][] = [header];
  for (const c of contatos) {
    const tel = normalizePhoneForVcard(c.telefone);
    if (!tel) continue;
    const fullName = aplicarTag(c.nome || "", tagPrefixo);
    const note = [
      regiaoLabel ? `Região: ${regiaoLabel}` : "",
      c.tipo ? `Tipo: ${c.tipo}` : "",
      c.bairro ? `Bairro: ${c.bairro}` : "",
    ].filter(Boolean).join(" | ");
    rows.push([fullName, fullName, "Mobile", tel, note]);
  }
  return rows.map((r) => r.map(csvEscape).join(",")).join("\r\n");
}

function csvEscape(value: string): string {
  const v = String(value ?? "");
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

/**
 * Substitui placeholders no template da mensagem.
 *  - [coordenador_nome] [regiao] [qtd_contatos] [qtd_novos]
 */
export function aplicarTemplateMensagem(template: string, vars: Record<string, string>): string {
  let out = template || "";
  for (const [k, v] of Object.entries(vars)) {
    out = out.replace(new RegExp(`\\[${k}\\]`, "g"), v);
  }
  return out;
}

/** Monta texto-bloco com TODOS os contatos no corpo (caso usuário queira mensagem só de texto). */
export function gerarTextoContatosBloco(params: {
  contatos: ContatoExport[];
  tagPrefixo: string;
}): string {
  const { contatos, tagPrefixo } = params;
  return contatos
    .map((c, i) => {
      const tel = normalizePhoneForVcard(c.telefone);
      const nome = aplicarTag(c.nome || "", tagPrefixo);
      return `${i + 1}. ${nome} — ${tel}`;
    })
    .join("\n");
}
