import jsPDF from "jspdf";
import { supabase } from "@/integrations/supabase/client-selfhosted";

type Doc = any;

function txt(v: any): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) return v.map(txt).filter(Boolean).join(", ");
  return v.nome || v.texto || v.titulo || v.descricao || JSON.stringify(v);
}

function flattenList(arr: any): string[] {
  if (!Array.isArray(arr)) return [];
  return arr.map((x) => txt(x)).filter(Boolean);
}

export async function exportLivroDeCampanha(clientId: string, clientNameHint?: string) {
  // 0. Try fetch client name
  let clientName = clientNameHint;
  if (!clientName) {
    const { data: c } = await supabase.from("clients").select("name").eq("id", clientId).maybeSingle();
    clientName = (c as any)?.name || "";
  }

  // 1. Fetch all docs
  const { data, error } = await supabase
    .from("ic_knowledge_documents" as any)
    .select("*")
    .eq("client_id", clientId)
    .order("data_evento", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) throw error;
  const docs = (data ?? []) as Doc[];
  if (docs.length === 0) throw new Error("Nenhum documento para exportar.");

  // 2. PDF setup
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const PAGE_W = 210;
  const PAGE_H = 297;
  const MARGIN = 18;
  const MAX_W = PAGE_W - MARGIN * 2;
  let y = MARGIN;

  const ensureSpace = (h: number) => {
    if (y + h > PAGE_H - MARGIN) {
      pdf.addPage();
      y = MARGIN;
    }
  };

  const writeWrapped = (text: string, opts: { size?: number; bold?: boolean; color?: [number, number, number]; lineGap?: number } = {}) => {
    if (!text) return;
    const size = opts.size ?? 10;
    pdf.setFont("helvetica", opts.bold ? "bold" : "normal");
    pdf.setFontSize(size);
    pdf.setTextColor(...(opts.color ?? [30, 30, 30]));
    const lines = pdf.splitTextToSize(text, MAX_W);
    const lineH = size * 0.45;
    for (const line of lines) {
      ensureSpace(lineH + (opts.lineGap ?? 0.5));
      pdf.text(line, MARGIN, y);
      y += lineH + (opts.lineGap ?? 0.5);
    }
  };

  const hr = (gap = 4) => {
    ensureSpace(gap + 1);
    pdf.setDrawColor(220);
    pdf.line(MARGIN, y, PAGE_W - MARGIN, y);
    y += gap;
  };

  // 3. Capa
  pdf.setFillColor(20, 30, 60);
  pdf.rect(0, 0, PAGE_W, PAGE_H, "F");
  pdf.setTextColor(255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(36);
  pdf.text("Livro de", MARGIN, 90);
  pdf.text("Campanha", MARGIN, 110);
  pdf.setFontSize(14);
  pdf.setFont("helvetica", "normal");
  pdf.text(clientName || "Memória do candidato", MARGIN, 130);
  pdf.setFontSize(10);
  pdf.setTextColor(180);
  pdf.text(`Consolidado de ${docs.length} documento(s)`, MARGIN, 145);
  pdf.text(`Gerado em ${new Date().toLocaleDateString("pt-BR")}`, MARGIN, 152);

  // 4. Sumário consolidado (agregado)
  pdf.addPage();
  y = MARGIN;
  writeWrapped("Visão consolidada", { size: 22, bold: true, color: [20, 30, 60] });
  y += 2;
  hr(6);

  const allBy = (key: string): string[] => {
    const set = new Map<string, number>();
    for (const d of docs) {
      for (const v of flattenList(d[key])) {
        const k = v.toLowerCase();
        set.set(k, (set.get(k) || 0) + 1);
        if (!set.has("__label_" + k)) set.set("__label_" + k, 0);
        // store label with original casing on first encounter
      }
    }
    const labels = new Map<string, string>();
    for (const d of docs) {
      for (const v of flattenList(d[key])) {
        const k = v.toLowerCase();
        if (!labels.has(k)) labels.set(k, v);
      }
    }
    return Array.from(set.entries())
      .filter(([k]) => !k.startsWith("__label_"))
      .sort((a, b) => b[1] - a[1])
      .map(([k, n]) => `${labels.get(k) || k} (${n})`);
  };

  const sections: Array<{ title: string; items: string[] }> = [
    { title: "Propostas mais citadas", items: allBy("propostas").slice(0, 30) },
    { title: "Promessas", items: allBy("promessas").slice(0, 30) },
    { title: "Bandeiras", items: allBy("bandeiras").slice(0, 25) },
    { title: "Bordões", items: allBy("bordoes").slice(0, 20) },
    { title: "Bairros citados", items: allBy("bairros_citados").slice(0, 40) },
    { title: "Pessoas citadas", items: allBy("pessoas_citadas").slice(0, 40) },
    { title: "Adversários citados", items: allBy("adversarios_citados").slice(0, 25) },
  ];

  for (const s of sections) {
    if (s.items.length === 0) continue;
    ensureSpace(10);
    writeWrapped(s.title, { size: 13, bold: true, color: [20, 30, 60] });
    y += 1;
    for (const item of s.items) {
      writeWrapped("• " + item, { size: 10 });
    }
    y += 3;
  }

  // 5. Documentos um a um
  for (const d of docs) {
    pdf.addPage();
    y = MARGIN;
    const date = d.data_evento || d.created_at;
    const dateStr = date ? new Date(date).toLocaleDateString("pt-BR") : "";

    writeWrapped(d.titulo || "Documento", { size: 18, bold: true, color: [20, 30, 60] });
    writeWrapped(
      [dateStr, d.local, d.tom_emocional && `tom: ${d.tom_emocional}`].filter(Boolean).join("  •  "),
      { size: 9, color: [110, 110, 110] }
    );
    y += 2;
    hr(5);

    if (d.resumo_executivo) {
      writeWrapped("Resumo executivo", { size: 12, bold: true, color: [20, 30, 60] });
      writeWrapped(d.resumo_executivo, { size: 10 });
      y += 3;
    }

    const blocks: Array<[string, any]> = [
      ["Pontos principais", d.pontos_principais],
      ["Propostas", d.propostas],
      ["Promessas", d.promessas],
      ["Bandeiras", d.bandeiras],
      ["Bordões", d.bordoes],
      ["Pessoas citadas", d.pessoas_citadas],
      ["Bairros citados", d.bairros_citados],
      ["Adversários citados", d.adversarios_citados],
      ["Números e dados", d.numeros_e_dados],
    ];

    for (const [label, val] of blocks) {
      const items = flattenList(val);
      if (items.length === 0) continue;
      ensureSpace(8);
      writeWrapped(label, { size: 12, bold: true, color: [20, 30, 60] });
      for (const it of items) writeWrapped("• " + it, { size: 10 });
      y += 2;
    }

    if (Array.isArray(d.tags) && d.tags.length) {
      y += 1;
      writeWrapped("Tags: " + d.tags.join(", "), { size: 9, color: [110, 110, 110] });
    }
  }

  // 6. Footer / page numbers
  const total = pdf.getNumberOfPages();
  for (let i = 2; i <= total; i++) {
    pdf.setPage(i);
    pdf.setFontSize(8);
    pdf.setTextColor(140);
    pdf.text(`${i - 1} / ${total - 1}`, PAGE_W - MARGIN, PAGE_H - 8, { align: "right" });
    pdf.text(`Livro de Campanha — ${clientName || ""}`, MARGIN, PAGE_H - 8);
  }

  const safeName = (clientName || "campanha").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  pdf.save(`livro-de-campanha-${safeName}-${new Date().toISOString().slice(0, 10)}.pdf`);
}
