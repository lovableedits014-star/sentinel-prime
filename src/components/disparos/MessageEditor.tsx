import { useMemo, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  renderPreviewBatch,
  validateSpintax,
  type Recipient,
} from "@/lib/message-variation";
import {
  ALL_CATEGORIES,
  CATEGORY_LABELS,
  DEFAULT_CTAS,
  mergeCtas,
  pickCta,
  type CtaCategory,
  type Cta,
} from "@/lib/response-ctas";
import { Sparkles, Wand2, AlertTriangle, MessageSquareText } from "lucide-react";

export type CtaConfig = {
  auto_append: boolean;
  categories: CtaCategory[]; // vazio = todas
};

export const DEFAULT_CTA_CONFIG: CtaConfig = {
  auto_append: false,
  categories: [],
};

interface Props {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  /** Nomes reais dos primeiros destinatários, para preview realista. */
  sampleNames?: string[];
  /** Biblioteca personalizada do cliente (do banco). */
  clientCtas?: Cta[] | null;
  /** Configuração atual de CTA (controlado pelo parent). */
  ctaConfig: CtaConfig;
  onCtaConfigChange: (c: CtaConfig) => void;
}

const PLACEHOLDERS: Array<{ label: string; insert: string; hint: string }> = [
  { label: "{nome}", insert: "{nome}", hint: "Nome completo" },
  { label: "{primeiro_nome}", insert: "{primeiro_nome}", hint: "Primeiro nome" },
  { label: "{saudacao}", insert: "{saudacao}", hint: "Bom dia/tarde/noite" },
  { label: "{dia_semana}", insert: "{dia_semana}", hint: "Segunda, terça…" },
  { label: "{emoji_positivo}", insert: "{emoji_positivo}", hint: "🙏 💪 ❤️…" },
  { label: "{cta_resposta}", insert: "{cta_resposta}", hint: "Convite pra responder" },
];

const SPINTAX_SNIPPETS: Array<{ label: string; insert: string }> = [
  { label: "Saudação variada", insert: "{Olá|Oi|E aí}" },
  { label: "Pergunta educada", insert: "{tudo bem|beleza|como vai}" },
  { label: "Bloco alternativo", insert: "[[Texto A|Texto B]]" },
];

export default function MessageEditor({
  value,
  onChange,
  disabled,
  sampleNames = [],
  clientCtas = [],
  ctaConfig,
  onCtaConfigChange,
}: Props) {
  const [showPreview, setShowPreview] = useState(true);

  const validation = useMemo(() => validateSpintax(value || ""), [value]);

  // Pool efetivo de CTAs (defaults + custom, respeitando categorias selecionadas)
  const activeCtas = useMemo(() => {
    const merged = mergeCtas(clientCtas);
    if (!ctaConfig.categories.length) return merged;
    return merged.filter((c) => ctaConfig.categories.includes(c.category));
  }, [clientCtas, ctaConfig.categories]);

  // Amostras de preview
  const previewSamples = useMemo(() => {
    if (!value.trim()) return null;
    if (!validation.ok) return null;
    const names = (sampleNames.length ? sampleNames : ["Ana Costa", "Bruno Silva", "Carla Souza", "Diego Ramos", "Elisa Nunes"]).slice(0, 5);
    const recipients: Recipient[] = names.map((n) => ({ nome: n }));
    // Sorteia CTA por destinatário localmente para o preview
    const avoid = new Set<string>();
    const ctxPerRecipient = recipients.map(() => {
      const picked = pickCta(clientCtas, ctaConfig.categories.length ? ctaConfig.categories : undefined, { avoidIds: avoid });
      if (picked) {
        avoid.add(picked.id);
        if (avoid.size > 5) {
          const first = avoid.values().next().value;
          if (first) avoid.delete(first);
        }
      }
      return { cta: picked?.text ?? null, autoAppendCta: ctaConfig.auto_append };
    });

    const samples = recipients.map((r, i) => {
      // renderMessage é determinístico se rng não muda, mas queremos variação
      // — não passamos rng para deixar o Math.random padrão sortear.
      return {
        recipient: r,
        result: renderPreviewBatch(value, [r], ctxPerRecipient[i]).samples[0],
      };
    });
    const uniq = new Set(samples.map((s) => s.result.text));
    return { samples, uniqueCount: uniq.size, total: samples.length };
  }, [value, sampleNames, validation.ok, ctaConfig, clientCtas]);

  const insertAtCursor = (snippet: string) => {
    const el = document.getElementById("msg-editor-textarea") as HTMLTextAreaElement | null;
    if (!el) {
      onChange((value || "") + snippet);
      return;
    }
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = value.slice(0, start) + snippet + value.slice(end);
    onChange(next);
    // Reposiciona cursor após o snippet
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + snippet.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const toggleCategory = (cat: CtaCategory) => {
    const has = ctaConfig.categories.includes(cat);
    onCtaConfigChange({
      ...ctaConfig,
      categories: has ? ctaConfig.categories.filter((c) => c !== cat) : [...ctaConfig.categories, cat],
    });
  };

  const uniquenessPct = previewSamples
    ? Math.round((previewSamples.uniqueCount / previewSamples.total) * 100)
    : 0;

  return (
    <div className="space-y-3">
      <Tabs defaultValue="editor">
        <TabsList>
          <TabsTrigger value="editor" className="gap-1.5">
            <MessageSquareText className="w-4 h-4" />
            Mensagem
          </TabsTrigger>
          <TabsTrigger value="cta" className="gap-1.5">
            <Sparkles className="w-4 h-4" />
            CTAs de resposta
            {ctaConfig.auto_append && <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">auto</Badge>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="editor" className="space-y-3 mt-3">
          {/* Toolbar */}
          <div className="flex flex-wrap gap-1.5 items-center">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" disabled={disabled} className="gap-1">
                  <Wand2 className="w-3.5 h-3.5" /> Variações
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-64 p-2">
                <p className="text-xs text-muted-foreground mb-2">Inserir spintax (o sistema sorteia por destinatário)</p>
                {SPINTAX_SNIPPETS.map((s) => (
                  <button
                    key={s.label}
                    type="button"
                    onClick={() => insertAtCursor(s.insert)}
                    className="w-full text-left text-sm py-1.5 px-2 rounded hover:bg-muted"
                  >
                    <div className="font-medium">{s.label}</div>
                    <code className="text-[11px] text-muted-foreground">{s.insert}</code>
                  </button>
                ))}
              </PopoverContent>
            </Popover>

            {PLACEHOLDERS.map((p) => (
              <Button
                key={p.label}
                variant="outline"
                size="sm"
                onClick={() => insertAtCursor(p.insert)}
                disabled={disabled}
                className="h-8 text-xs font-mono"
                title={p.hint}
              >
                {p.label}
              </Button>
            ))}
          </div>

          <Textarea
            id="msg-editor-textarea"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Olá {primeiro_nome}! {Temos uma novidade|Preciso te contar algo importante}… {cta_resposta}"
            rows={5}
            disabled={disabled}
            className={!validation.ok ? "border-destructive" : ""}
          />

          {!validation.ok && (
            <div className="flex items-start gap-2 text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded p-2">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>Spintax inválida: {validation.error}. Corrija antes de disparar.</span>
            </div>
          )}

          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Use <code className="bg-muted px-1 rounded">{"{a|b|c}"}</code> para sortear, e placeholders para personalizar.
              O link é preservado 100%.
            </p>
            <button
              type="button"
              onClick={() => setShowPreview((v) => !v)}
              className="text-xs text-primary hover:underline"
            >
              {showPreview ? "Ocultar" : "Mostrar"} preview
            </button>
          </div>

          {showPreview && previewSamples && (
            <div className="border rounded-lg p-3 space-y-2 bg-muted/20">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Preview ({previewSamples.total} amostras)
                </span>
                <Badge
                  variant={uniquenessPct >= 80 ? "default" : uniquenessPct >= 50 ? "secondary" : "destructive"}
                  className="text-[10px]"
                >
                  Unicidade: {uniquenessPct}%
                </Badge>
              </div>
              {previewSamples.samples.map((s, i) => (
                <div key={i} className="text-xs bg-background border rounded p-2 whitespace-pre-wrap">
                  <span className="text-muted-foreground">→ {s.recipient.nome}:</span>{" "}
                  {s.result.text}
                  {s.result.ctaUsed && (
                    <div className="mt-1">
                      <Badge variant="outline" className="text-[9px]">CTA: {s.result.ctaUsed.slice(0, 40)}</Badge>
                    </div>
                  )}
                </div>
              ))}
              {uniquenessPct < 50 && (
                <p className="text-[11px] text-amber-700 dark:text-amber-400">
                  ⚠️ Baixa variação — adicione mais <code>{"{a|b}"}</code> ou <code>{"{cta_resposta}"}</code> para reduzir risco de spam.
                </p>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="cta" className="space-y-3 mt-3">
          <div className="flex items-center justify-between border rounded-lg p-3">
            <div className="space-y-0.5">
              <Label className="text-sm">Adicionar CTA automático ao fim</Label>
              <p className="text-xs text-muted-foreground">
                Se o texto não terminar em pergunta, injeta um convite a responder.
                Aumenta reciprocidade e reduz risco de banimento.
              </p>
            </div>
            <Switch
              checked={ctaConfig.auto_append}
              onCheckedChange={(v) => onCtaConfigChange({ ...ctaConfig, auto_append: v })}
              disabled={disabled}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm">Categorias ativas</Label>
            <p className="text-xs text-muted-foreground">
              Vazio = todas. Filtre para o tom do disparo.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {ALL_CATEGORIES.map((cat) => {
                const active = ctaConfig.categories.includes(cat);
                return (
                  <Button
                    key={cat}
                    type="button"
                    size="sm"
                    variant={active ? "default" : "outline"}
                    onClick={() => toggleCategory(cat)}
                    disabled={disabled}
                    className="h-7 text-xs"
                  >
                    {CATEGORY_LABELS[cat]}
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="border rounded-lg p-3 space-y-1.5 max-h-64 overflow-auto">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
              Pool de CTAs ({activeCtas.length})
            </p>
            {activeCtas.length === 0 && (
              <p className="text-xs text-muted-foreground">Nenhum CTA na seleção. Ajuste as categorias acima.</p>
            )}
            {activeCtas.map((c) => (
              <div key={c.id} className="text-xs flex items-start gap-2 py-1 border-b last:border-b-0">
                <Badge variant="outline" className="text-[9px] shrink-0 mt-0.5">
                  {CATEGORY_LABELS[c.category]}
                </Badge>
                <span className="text-foreground">{c.text}</span>
              </div>
            ))}
          </div>

          <p className="text-[11px] text-muted-foreground">
            Total de CTAs padrão: {DEFAULT_CTAS.length}. Você pode editar a biblioteca do cliente
            futuramente em Configurações.
          </p>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/** Valida se o template está pronto para envio — usado pelo parent antes de disparar. */
export function isTemplateReady(template: string): { ok: boolean; error?: string } {
  return validateSpintax(template);
}
