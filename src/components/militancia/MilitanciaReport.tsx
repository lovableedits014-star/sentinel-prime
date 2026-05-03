import { useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Download, Printer, Copy, FileText } from "lucide-react";
import { BADGE_META } from "@/lib/militant-badges";
import { toast } from "sonner";
import type { MilitantRow } from "@/hooks/useMilitants";

interface Props {
  militants: MilitantRow[];
}

function pct(part: number, total: number) {
  if (!total) return "0%";
  return `${((part / total) * 100).toFixed(1)}%`;
}

export function MilitanciaReport({ militants }: Props) {
  const reportRef = useRef<HTMLDivElement>(null);

  const data = useMemo(() => {
    const fb = militants.filter(m => m.platform === "facebook");
    const ig = militants.filter(m => m.platform === "instagram");
    const all = militants;

    const sumSent = (list: MilitantRow[]) => list.reduce(
      (a, m) => ({
        pos: a.pos + (m.total_positive || 0),
        neg: a.neg + (m.total_negative || 0),
        neu: a.neu + (m.total_neutral || 0),
        com: a.com + (m.total_comments || 0),
      }), { pos: 0, neg: 0, neu: 0, com: 0 }
    );

    const countBadges = (list: MilitantRow[]) => {
      const map: Record<string, number> = {};
      list.forEach(m => { const b = m.current_badge || "observador"; map[b] = (map[b] || 0) + 1; });
      return map;
    };

    const last7 = Date.now() - 7 * 86400000;
    const last30 = Date.now() - 30 * 86400000;

    const novos7 = all.filter(m => new Date(m.first_seen_at).getTime() >= last7).length;
    const ativos30 = all.filter(m => new Date(m.last_seen_at).getTime() >= last30).length;

    const top5Defensores = [...all]
      .filter(m => m.total_positive > 0)
      .sort((a, b) => b.total_positive - a.total_positive)
      .slice(0, 5);

    const top5Riscos = [...all]
      .filter(m => m.total_negative > 0)
      .sort((a, b) => b.total_negative - a.total_negative)
      .slice(0, 5);

    return {
      fb, ig, all,
      sentFb: sumSent(fb),
      sentIg: sumSent(ig),
      sentAll: sumSent(all),
      badgesAll: countBadges(all),
      badgesFb: countBadges(fb),
      badgesIg: countBadges(ig),
      novos7, ativos30,
      top5Defensores, top5Riscos,
    };
  }, [militants]);

  const generateMarkdown = () => {
    const today = new Date().toLocaleDateString("pt-BR");
    const { sentAll, sentFb, sentIg, badgesAll, novos7, ativos30, top5Defensores, top5Riscos, all, fb, ig } = data;

    const ratio = sentAll.neg ? (sentAll.pos / sentAll.neg).toFixed(2) : "∞";
    const climateScore = sentAll.com > 0
      ? Math.round(((sentAll.pos - sentAll.neg) / sentAll.com) * 100)
      : 0;
    const climateLabel =
      climateScore >= 30 ? "🟢 Favorável" :
      climateScore >= 0 ? "🟡 Neutro" :
      climateScore >= -30 ? "🟠 Tenso" : "🔴 Hostil";

    let md = `# Relatório de Militância Digital\n`;
    md += `**Data:** ${today}\n\n`;
    md += `---\n\n`;
    md += `## 📊 Visão Geral\n\n`;
    md += `- **Perfis identificados:** ${all.length} (Facebook: ${fb.length} • Instagram: ${ig.length})\n`;
    md += `- **Comentários classificados:** ${sentAll.com}\n`;
    md += `- **Novos rostos (últimos 7 dias):** ${novos7}\n`;
    md += `- **Perfis ativos (últimos 30 dias):** ${ativos30}\n`;
    md += `- **Clima geral:** ${climateLabel} (${climateScore > 0 ? "+" : ""}${climateScore})\n`;
    md += `- **Razão Positivo/Negativo:** ${ratio} : 1\n\n`;

    md += `## 💬 Sentimento Acumulado\n\n`;
    md += `| Plataforma | Positivos | Negativos | Neutros | Total |\n`;
    md += `|---|---|---|---|---|\n`;
    md += `| Facebook | ${sentFb.pos} (${pct(sentFb.pos, sentFb.com)}) | ${sentFb.neg} (${pct(sentFb.neg, sentFb.com)}) | ${sentFb.neu} | ${sentFb.com} |\n`;
    md += `| Instagram | ${sentIg.pos} (${pct(sentIg.pos, sentIg.com)}) | ${sentIg.neg} (${pct(sentIg.neg, sentIg.com)}) | ${sentIg.neu} | ${sentIg.com} |\n`;
    md += `| **Total** | **${sentAll.pos}** | **${sentAll.neg}** | **${sentAll.neu}** | **${sentAll.com}** |\n\n`;

    md += `## 🏷️ Distribuição por Selo\n\n`;
    Object.entries(badgesAll)
      .sort((a, b) => b[1] - a[1])
      .forEach(([key, count]) => {
        const meta = BADGE_META[key as keyof typeof BADGE_META];
        if (meta) md += `- ${meta.emoji} **${meta.label}:** ${count} (${pct(count, all.length)})\n`;
      });
    md += `\n`;

    md += `## 🔥 Top 5 Defensores\n\n`;
    top5Defensores.forEach((m, i) => {
      md += `${i + 1}. **${m.author_name || "—"}** (${m.platform}) — ${m.total_positive} positivos / ${m.total_negative} negativos\n`;
    });
    md += `\n`;

    md += `## ⚠️ Top 5 Pontos de Atenção\n\n`;
    top5Riscos.forEach((m, i) => {
      md += `${i + 1}. **${m.author_name || "—"}** (${m.platform}) — ${m.total_negative} negativos / ${m.total_positive} positivos\n`;
    });
    md += `\n`;

    md += `## 🎯 Recomendações\n\n`;
    if (climateScore < 0) md += `- Clima negativo detectado. Priorize respostas em comentários críticos e considere conteúdo de esclarecimento.\n`;
    if (climateScore >= 30) md += `- Clima favorável. Momento ideal para lançar pautas mobilizadoras e pedir compartilhamentos da Tropa de Elite.\n`;
    if (novos7 > 10) md += `- Crescimento expressivo de novos rostos. Engaje rapidamente para convertê-los em defensores.\n`;
    if ((badgesAll.hater || 0) > 5) md += `- ${badgesAll.hater} haters persistentes ativos. Considere bloqueio ou ocultação sistemática.\n`;
    if ((badgesAll.elite || 0) > 0) md += `- ${badgesAll.elite} apoiadores de elite identificados. Promova-os ao CRM e convide para missões de engajamento.\n`;
    md += `\n---\n_Relatório gerado automaticamente pela plataforma._\n`;

    return md;
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(generateMarkdown());
    toast.success("Relatório copiado!", { description: "Cole onde quiser (WhatsApp, e-mail, Notion...)" });
  };

  const handleDownload = () => {
    const md = generateMarkdown();
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `militancia-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Download iniciado");
  };

  const handlePrint = () => {
    window.print();
  };

  const { sentAll, sentFb, sentIg, badgesAll, novos7, ativos30, top5Defensores, top5Riscos, all, fb, ig } = data;
  const climateScore = sentAll.com > 0 ? Math.round(((sentAll.pos - sentAll.neg) / sentAll.com) * 100) : 0;
  const climateLabel =
    climateScore >= 30 ? { txt: "Favorável", cls: "text-green-700 bg-green-500/10" } :
    climateScore >= 0 ? { txt: "Neutro", cls: "text-amber-700 bg-amber-500/10" } :
    climateScore >= -30 ? { txt: "Tenso", cls: "text-orange-700 bg-orange-500/10" } :
    { txt: "Hostil", cls: "text-destructive bg-destructive/10" };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">Relatório Executivo</h3>
          <span className="text-xs text-muted-foreground">— gerado em {new Date().toLocaleDateString("pt-BR")}</span>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={handleCopy} className="gap-1.5"><Copy className="w-3.5 h-3.5" /> Copiar</Button>
          <Button size="sm" variant="outline" onClick={handleDownload} className="gap-1.5"><Download className="w-3.5 h-3.5" /> Baixar .md</Button>
          <Button size="sm" onClick={handlePrint} className="gap-1.5"><Printer className="w-3.5 h-3.5" /> Imprimir / PDF</Button>
        </div>
      </div>

      <div ref={reportRef} className="bg-card border rounded-xl p-6 space-y-6 print:border-0 print:p-0">
        {/* Header */}
        <div className="border-b pb-4">
          <h2 className="text-xl font-bold">Relatório de Militância Digital</h2>
          <p className="text-xs text-muted-foreground mt-1">Snapshot consolidado · {new Date().toLocaleString("pt-BR")}</p>
        </div>

        {/* Hero KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="p-3 rounded-lg bg-muted/40">
            <p className="text-2xl font-bold">{all.length}</p>
            <p className="text-xs text-muted-foreground">Perfis identificados</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/40">
            <p className="text-2xl font-bold">{sentAll.com}</p>
            <p className="text-xs text-muted-foreground">Comentários classificados</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/40">
            <p className="text-2xl font-bold text-cyan-600">+{novos7}</p>
            <p className="text-xs text-muted-foreground">Novos rostos (7d)</p>
          </div>
          <div className={`p-3 rounded-lg ${climateLabel.cls}`}>
            <p className="text-2xl font-bold">{climateScore > 0 ? "+" : ""}{climateScore}</p>
            <p className="text-xs">Clima: {climateLabel.txt}</p>
          </div>
        </div>

        {/* Comparativo plataformas */}
        <div>
          <h3 className="text-sm font-semibold mb-2">💬 Sentimento por plataforma</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead className="text-xs text-muted-foreground border-b">
                <tr>
                  <th className="text-left py-2 px-2">Plataforma</th>
                  <th className="text-right py-2 px-2">Perfis</th>
                  <th className="text-right py-2 px-2 text-green-700">Positivos</th>
                  <th className="text-right py-2 px-2 text-destructive">Negativos</th>
                  <th className="text-right py-2 px-2">Neutros</th>
                  <th className="text-right py-2 px-2">Total</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b">
                  <td className="py-2 px-2 font-medium">Facebook</td>
                  <td className="text-right">{fb.length}</td>
                  <td className="text-right text-green-700">{sentFb.pos}</td>
                  <td className="text-right text-destructive">{sentFb.neg}</td>
                  <td className="text-right text-muted-foreground">{sentFb.neu}</td>
                  <td className="text-right font-medium">{sentFb.com}</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2 px-2 font-medium">Instagram</td>
                  <td className="text-right">{ig.length}</td>
                  <td className="text-right text-green-700">{sentIg.pos}</td>
                  <td className="text-right text-destructive">{sentIg.neg}</td>
                  <td className="text-right text-muted-foreground">{sentIg.neu}</td>
                  <td className="text-right font-medium">{sentIg.com}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Distribuição por selo */}
        <div>
          <h3 className="text-sm font-semibold mb-2">🏷️ Distribuição da base por selo</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {Object.entries(badgesAll)
              .sort((a, b) => b[1] - a[1])
              .map(([key, count]) => {
                const meta = BADGE_META[key as keyof typeof BADGE_META];
                if (!meta) return null;
                return (
                  <div key={key} className={`p-2 rounded-lg border text-xs ${meta.className}`}>
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{meta.emoji} {meta.label}</span>
                      <span className="font-bold">{count}</span>
                    </div>
                    <p className="opacity-70 mt-0.5">{pct(count, all.length)} da base</p>
                  </div>
                );
              })}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Top defensores */}
          <div>
            <h3 className="text-sm font-semibold mb-2 text-green-700">🔥 Top 5 Defensores</h3>
            <ol className="space-y-1.5 text-sm">
              {top5Defensores.length === 0 && <li className="text-xs text-muted-foreground">Nenhum defensor identificado ainda.</li>}
              {top5Defensores.map((m, i) => (
                <li key={m.id} className="flex items-center justify-between border-b pb-1.5">
                  <span><span className="text-muted-foreground mr-2">{i + 1}.</span>{m.author_name || "—"} <span className="text-[10px] text-muted-foreground">({m.platform})</span></span>
                  <span className="text-xs"><span className="text-green-700 font-medium">+{m.total_positive}</span> / <span className="text-destructive">-{m.total_negative}</span></span>
                </li>
              ))}
            </ol>
          </div>

          {/* Top riscos */}
          <div>
            <h3 className="text-sm font-semibold mb-2 text-destructive">⚠️ Top 5 Pontos de Atenção</h3>
            <ol className="space-y-1.5 text-sm">
              {top5Riscos.length === 0 && <li className="text-xs text-muted-foreground">Nenhum risco relevante identificado.</li>}
              {top5Riscos.map((m, i) => (
                <li key={m.id} className="flex items-center justify-between border-b pb-1.5">
                  <span><span className="text-muted-foreground mr-2">{i + 1}.</span>{m.author_name || "—"} <span className="text-[10px] text-muted-foreground">({m.platform})</span></span>
                  <span className="text-xs"><span className="text-destructive font-medium">-{m.total_negative}</span> / <span className="text-green-700">+{m.total_positive}</span></span>
                </li>
              ))}
            </ol>
          </div>
        </div>

        {/* Recomendações */}
        <div>
          <h3 className="text-sm font-semibold mb-2">🎯 Recomendações automáticas</h3>
          <ul className="text-sm space-y-1.5 list-disc pl-5">
            {climateScore < 0 && <li>Clima negativo detectado. Priorize respostas em comentários críticos e produza conteúdo de esclarecimento nas próximas 48h.</li>}
            {climateScore >= 30 && <li>Clima favorável. Momento ideal para lançar pautas mobilizadoras e pedir compartilhamento à Tropa de Elite.</li>}
            {novos7 > 10 && <li><strong>{novos7}</strong> novos rostos nesta semana — engaje rapidamente para convertê-los em defensores.</li>}
            {(badgesAll.hater || 0) > 5 && <li><strong>{badgesAll.hater}</strong> haters persistentes ativos. Considere bloqueio sistemático.</li>}
            {(badgesAll.elite || 0) > 0 && <li><strong>{badgesAll.elite}</strong> apoiadores de elite — promova ao CRM e convide para missões de engajamento.</li>}
            {(badgesAll.sumido || 0) > 5 && <li><strong>{badgesAll.sumido}</strong> apoiadores sumidos. Vale uma campanha de reativação.</li>}
            {ativos30 < all.length * 0.3 && all.length > 20 && <li>Apenas {pct(ativos30, all.length)} da base esteve ativa nos últimos 30 dias. Frequência de postagem pode estar baixa.</li>}
          </ul>
        </div>

        <p className="text-[10px] text-muted-foreground text-center pt-4 border-t">Relatório gerado automaticamente · use os botões acima para copiar, baixar ou imprimir como PDF</p>
      </div>
    </div>
  );
}