import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import JSZip from "jszip";
import type { ExportCampo, ExportTipo } from "@/components/eleicao/ExportEleicaoDialog";
import type { ExportPessoa } from "@/lib/eleicao-export-pdf";

type Linha = ExportPessoa & { coordenador_id?: string; coordenador_nome?: string; lider_id?: string; lider_nome?: string; qtd_lideres?: number; qtd_cabos?: number };
type Coluna = { id: ExportCampo; label: string; value: (p: Linha) => string };

const phone = (value?: string | null) => {
  const d = (value || "").replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return value || "";
};
const brl = (value?: number | null) => value ? value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
const date = (value?: string | null) => value ? new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR") : "—";
const situacao = (p: Linha) => p.arquivado_em ? "Arquivado" : p.is_voluntario ? "Voluntário" : Number(p.valor_contratacao || 0) > 0 ? "Contratado" : "Sem contrato";
const endereco = (p: Linha) => [[p.rua, p.numero].filter(Boolean).join(", "), p.bairro, p.cidade].filter(Boolean).join(" — ") || "—";
const cargo = (p: Linha) => ({ coordenador: "Coordenador", lider: "Líder", cabo: "Cabo" }[p.tipo] || p.tipo);
const slug = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, " ").trim();

const COLUNAS: Coluna[] = [
  { id: "nome", label: "Nome", value: p => p.nome }, { id: "tipo", label: "Cargo", value: cargo },
  { id: "telefone", label: "Telefone", value: p => phone(p.telefone) },
  { id: "coordenador", label: "Coordenador", value: p => p.coordenador_nome || (p.tipo === "coordenador" ? p.nome : "—") },
  { id: "lider", label: "Líder", value: p => p.lider_nome || (p.tipo === "lider" ? p.nome : "—") },
  { id: "regiao", label: "Região", value: p => p.regiao || "—" }, { id: "cidade", label: "Cidade", value: p => p.cidade || "—" },
  { id: "rua", label: "Rua", value: p => p.rua || "—" }, { id: "numero", label: "Número", value: p => p.numero || "—" },
  { id: "bairro", label: "Bairro", value: p => p.bairro || "—" }, { id: "endereco_completo", label: "Endereço completo", value: endereco },
  { id: "qtd_lideres", label: "Qtd. líderes", value: p => String(p.qtd_lideres ?? 0) },
  { id: "qtd_cabos", label: "Qtd. cabos", value: p => String(p.qtd_cabos ?? 0) },
  { id: "valor", label: "Valor", value: p => brl(p.valor_contratacao) }, { id: "situacao", label: "Situação", value: situacao },
  { id: "reuniao", label: "Reunião", value: p => p.participou_reuniao ? "Participou" : "Não participou" },
  { id: "vigencia", label: "Vigência", value: p => `${date(p.vigencia_inicio)} a ${date(p.vigencia_fim)}` },
  { id: "observacoes", label: "Observações", value: p => (p.observacoes || "").replace(/\s+/g, " ") },
];

export function enriquecerHierarquia(pessoas: ExportPessoa[]): Linha[] {
  const byId = new Map(pessoas.filter(p => p.id).map(p => [p.id!, p]));
  const filhos = new Map<string, ExportPessoa[]>();
  pessoas.forEach(p => { if (p.parent_id) filhos.set(p.parent_id, [...(filhos.get(p.parent_id) || []), p]); });
  const descendentes = (id: string, tipo: ExportTipo) => {
    const vistos = new Set<string>(); const fila = [...(filhos.get(id) || [])]; let total = 0;
    while (fila.length) { const p = fila.shift()!; if (!p.id || vistos.has(p.id)) continue; vistos.add(p.id); if (p.tipo === tipo) total++; fila.push(...(filhos.get(p.id) || [])); }
    return total;
  };
  return pessoas.map(p => {
    let atual: ExportPessoa | undefined = p; let coord: ExportPessoa | undefined; let lider: ExportPessoa | undefined; const vistos = new Set<string>();
    while (atual && !vistos.has(atual.id || "")) { if (atual.id) vistos.add(atual.id); if (atual.tipo === "coordenador") coord = atual; if (atual.tipo === "lider" && !lider) lider = atual; atual = atual.parent_id ? byId.get(atual.parent_id) : undefined; }
    return { ...p, coordenador_id: coord?.id, coordenador_nome: coord?.nome, lider_id: lider?.id, lider_nome: lider?.nome, qtd_lideres: p.id ? descendentes(p.id, "lider") : 0, qtd_cabos: p.id ? descendentes(p.id, "cabo") : 0 };
  });
}

const selecionar = (campos: ExportCampo[]) => campos.map(id => COLUNAS.find(c => c.id === id)).filter((c): c is Coluna => !!c);
const baixar = (blob: Blob, nome: string) => { const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = nome; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };

function pdfBlob(pessoas: Linha[], campos: ExportCampo[], titulo: string, subtitulo: string) {
  const cols = selecionar(campos); const landscape = cols.length > 6;
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: landscape ? "landscape" : "portrait" });
  const width = doc.internal.pageSize.getWidth();
  doc.setFillColor(15, 23, 42); doc.rect(0, 0, width, 68, "F"); doc.setTextColor(255); doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.text(titulo, 32, 29);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.text(subtitulo, 32, 47); doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, width - 32, 47, { align: "right" });
  autoTable(doc, { startY: 84, head: [cols.map(c => c.label)], body: pessoas.map(p => cols.map(c => c.value(p))), theme: "striped", styles: { fontSize: cols.length > 8 ? 6.5 : 8, cellPadding: 3, overflow: "linebreak" }, headStyles: { fillColor: [30, 41, 59] }, margin: { left: 24, right: 24, bottom: 24 } });
  const pages = doc.getNumberOfPages(); for (let i = 1; i <= pages; i++) { doc.setPage(i); doc.setFontSize(7); doc.setTextColor(130); doc.text(`Página ${i} de ${pages}`, width / 2, doc.internal.pageSize.getHeight() - 10, { align: "center" }); }
  return doc.output("blob");
}

function pdfEquipesBlob(pessoas: Linha[], campos: ExportCampo[], escopo: string) {
  const cols = selecionar(campos); const landscape = cols.length > 6;
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: landscape ? "landscape" : "portrait" });
  const width = doc.internal.pageSize.getWidth(); const height = doc.internal.pageSize.getHeight(); const margin = 28;
  doc.setFillColor(15, 23, 42); doc.rect(0, 0, width, 68, "F"); doc.setTextColor(255); doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.text("Estrutura por Coordenador", margin, 29);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.text(`${escopo} · ${pessoas.length} cadastro(s)`, margin, 47); doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, width - margin, 47, { align: "right" });
  let y = 84;
  const coords = pessoas.filter(p => p.tipo === "coordenador").sort((a, b) => a.nome.localeCompare(b.nome));
  const idsComEquipe = new Set<string>();
  for (const coord of coords) {
    const equipe = pessoas.filter(p => p.id === coord.id || p.coordenador_id === coord.id);
    equipe.forEach(p => { if (p.id) idsComEquipe.add(p.id); });
    if (y > height - 110) { doc.addPage(); y = margin; }
    doc.setFillColor(30, 41, 59); doc.roundedRect(margin, y, width - margin * 2, 35, 4, 4, "F");
    doc.setTextColor(255); doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.text(`Coordenador: ${coord.nome}`, margin + 10, y + 14);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.text(`${coord.qtd_lideres || 0} líder(es) · ${coord.qtd_cabos || 0} cabo(s) · ${coord.regiao || coord.cidade || "Local não informado"}`, margin + 10, y + 27);
    autoTable(doc, { startY: y + 41, head: [cols.map(c => c.label)], body: equipe.map(p => cols.map(c => c.value(p))), theme: "striped", styles: { fontSize: cols.length > 8 ? 6.5 : 8, cellPadding: 3, overflow: "linebreak" }, headStyles: { fillColor: [71, 85, 105] }, margin: { left: margin, right: margin, bottom: 24 }, didParseCell: data => { if (data.section === "body" && equipe[data.row.index]?.id === coord.id) data.cell.styles.fontStyle = "bold"; } });
    y = (doc as any).lastAutoTable.finalY + 18;
  }
  const avulsos = pessoas.filter(p => !p.id || !idsComEquipe.has(p.id));
  if (avulsos.length) {
    if (y > height - 110) { doc.addPage(); y = margin; }
    doc.setFillColor(180, 83, 9); doc.roundedRect(margin, y, width - margin * 2, 28, 4, 4, "F"); doc.setTextColor(255); doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.text("Sem coordenador / vínculos avulsos", margin + 10, y + 18);
    autoTable(doc, { startY: y + 34, head: [cols.map(c => c.label)], body: avulsos.map(p => cols.map(c => c.value(p))), theme: "striped", styles: { fontSize: cols.length > 8 ? 6.5 : 8, cellPadding: 3 }, headStyles: { fillColor: [146, 64, 14] }, margin: { left: margin, right: margin, bottom: 24 } });
  }
  const pages = doc.getNumberOfPages(); for (let i = 1; i <= pages; i++) { doc.setPage(i); doc.setFontSize(7); doc.setTextColor(130); doc.text(`Estrutura por Coordenador · Página ${i} de ${pages}`, width / 2, height - 10, { align: "center" }); }
  return doc.output("blob");
}

export function exportarPdfConfiguravel(pessoas: ExportPessoa[], campos: ExportCampo[], titulo: string, escopo: string, imprimir = false, porEquipe = false) {
  const linhas = enriquecerHierarquia(pessoas);
  const blob = porEquipe ? pdfEquipesBlob(linhas, campos, escopo) : pdfBlob(linhas, campos, titulo, `${escopo} · ${pessoas.length} cadastro(s)`);
  if (!imprimir) { baixar(blob, `${slug(titulo)}.pdf`); return; }
  const url = URL.createObjectURL(blob); const janela = window.open(url, "_blank");
  if (!janela) { baixar(blob, `${slug(titulo)}.pdf`); return; }
  setTimeout(() => { janela.focus(); janela.print(); }, 600);
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export function exportarCsvConfiguravel(pessoas: ExportPessoa[], campos: ExportCampo[], nome = "cadastros-eleicao") {
  const cols = selecionar(campos); const linhas = enriquecerHierarquia(pessoas); const escape = (v: string) => /[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  const csv = "\uFEFF" + [cols.map(c => c.label), ...linhas.map(p => cols.map(c => c.value(p)))].map(r => r.map(escape).join(";")).join("\n");
  baixar(new Blob([csv], { type: "text/csv;charset=utf-8" }), `${slug(nome)}.csv`);
}

export async function exportarZipPorCoordenador(pessoas: ExportPessoa[], campos: ExportCampo[], escopo: string) {
  const linhas = enriquecerHierarquia(pessoas); const coords = linhas.filter(p => p.tipo === "coordenador"); const zip = new JSZip(); const usados = new Set<string>();
  for (const coord of coords) {
    const equipe = linhas.filter(p => p.id === coord.id || p.coordenador_id === coord.id);
    let nome = `Coordenador ${slug(coord.nome)}`; if (usados.has(nome)) nome += ` - ${slug(coord.regiao || coord.cidade || coord.id || "equipe")}`; usados.add(nome);
    zip.file(`${nome}.pdf`, await pdfBlob(equipe, campos, `Coordenador ${coord.nome}`, `${escopo} · ${coord.qtd_lideres || 0} líder(es) · ${coord.qtd_cabos || 0} cabo(s)`).arrayBuffer());
  }
  if (!coords.length) throw new Error("Nenhum coordenador encontrado para gerar o ZIP.");
  baixar(await zip.generateAsync({ type: "blob", compression: "DEFLATE" }), `Equipes coordenadores ${new Date().toISOString().slice(0, 10)}.zip`);
  return coords.length;
}
