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

function nowRevStamp(): string {
  // RFC 2425 timestamp: 20260625T120000Z
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function uidFor(c: ContatoExport, tel: string): string {
  const seed = (c.pessoa_id || "") + "|" + tel;
  // hash simples e estável (djb2)
  let h = 5381;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) + h + seed.charCodeAt(i)) | 0;
  return `lov-${Math.abs(h).toString(36)}-${tel.replace(/\D/g, "").slice(-6)}`;
}

/** Gera UM vCard 3.0 individual (usado tanto no lote quanto no zip por contato). */
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
    `N:${fullName};;;;`,
    `FN:${fullName}`,
    `TEL;TYPE=CELL,VOICE:${tel}`,
  ];
  if (noteParts.length) linhas.push(`NOTE:${escapeVcardText(noteParts.join(" | "))}`);
  linhas.push(`UID:${uidFor(c, tel)}`);
  linhas.push(`REV:${nowRevStamp()}`);
  linhas.push("END:VCARD");
  return linhas.join("\r\n") + "\r\n";
}

/**
 * Gera vCard 3.0 com TODOS os contatos em um único arquivo.
 * Compatível com Google Contacts, Android. iOS importa, mas em alguns
 * casos o Safari mostra só 1 contato no preview — para iPhone use
 * gerarZipVcardsIphone.
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
    .join("");
}

/**
 * Gera um ZIP com 1 arquivo .vcf por contato (mais confiável no iPhone:
 * usuário abre o zip pelo Arquivos → seleciona todos → Compartilhar →
 * Contatos → "Adicionar todos").
 */
export async function gerarZipVcardsIphone(params: {
  contatos: ContatoExport[];
  tagPrefixo: string;
  regiaoLabel: string;
}): Promise<Blob> {
  const { contatos, tagPrefixo, regiaoLabel } = params;
  const JSZipMod = await import("jszip");
  const JSZip = JSZipMod.default || (JSZipMod as any);
  const zip = new JSZip();
  let idx = 0;
  for (const contato of contatos) {
    const vcf = gerarVcardIndividual({ contato, tagPrefixo, regiaoLabel });
    if (!vcf) continue;
    idx++;
    const safeNome = (aplicarTag(contato.nome || "contato", tagPrefixo) || "contato")
      .replace(/[^\p{L}\p{N}_-]+/gu, "_")
      .slice(0, 40);
    const seq = String(idx).padStart(3, "0");
    zip.file(`${seq}_${safeNome}.vcf`, vcf);
  }
  return zip.generateAsync({ type: "blob", mimeType: "application/zip" });
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
