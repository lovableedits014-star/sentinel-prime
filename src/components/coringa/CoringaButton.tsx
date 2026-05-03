import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Send, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentClientId } from "@/hooks/ic/useCurrentClientId";
import { toast } from "sonner";

interface Msg { role: "user" | "assistant"; content: string; tools?: any[] }

const SUGGESTIONS = [
  "Quantos apoiadores temos no Aero Rancho?",
  "O que o candidato falou sobre saúde nas últimas semanas?",
  "Quais alertas de crise estão ativos hoje?",
];

export function CoringaButton() {
  const { data: clientId } = useCurrentClientId();
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  if (!clientId) return null;

  // Limpa o histórico sempre que o bot for fechado
  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setMessages([]);
      setInput("");
    }
  };

  const send = async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || loading) return;
    setInput("");
    const newMsgs: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(newMsgs);
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("coringa-chat", {
        body: { clientId, message: text, history: messages },
      });
      // Erros HTTP do edge: o supabase-js coloca o status no contexto
      if (error) {
        const ctx: any = (error as any).context;
        const status = ctx?.status;
        let msg = error.message || "Erro ao falar com o Sentinelle Bot";
        try {
          const body = ctx?.body ? JSON.parse(ctx.body) : null;
          if (body?.error) msg = body.error;
        } catch {}
        if (status === 402) {
          msg = "💳 Créditos de IA esgotados no workspace. Adicione créditos em Settings → Workspace → Usage para continuar.";
        } else if (status === 429) {
          msg = "⏳ Muitas requisições. Aguarde alguns segundos e tente de novo.";
        }
        throw new Error(msg);
      }
      if (data?.error) throw new Error(data.error);
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply || "(sem resposta)", tools: data.tools_used }]);
    } catch (e: any) {
      toast.error(e.message || "Erro ao falar com o Sentinelle Bot");
      setMessages((prev) => [...prev, { role: "assistant", content: "❌ " + (e.message || "Erro inesperado") }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Floating launcher — discreto, com peek/hide para nao atrapalhar */}
      <div
        className={`fixed z-50 right-4 sm:right-6 transition-all duration-300 ${
          hidden ? "translate-x-[60%] opacity-60 hover:translate-x-0 hover:opacity-100" : ""
        }`}
        style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 5.5rem)" }}
      >
        <div className="relative group">
          {/* glow */}
          <div className="absolute inset-0 rounded-full bg-gradient-to-br from-blue-500 via-blue-400 to-cyan-400 blur-lg opacity-60 group-hover:opacity-90 transition-opacity" />
          <Button
            onClick={() => setOpen(true)}
            size="icon"
            className="relative h-14 w-14 rounded-full border border-white/20 bg-gradient-to-br from-blue-600 via-blue-500 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white shadow-2xl hover:scale-105 transition-all"
            title="Sentinelle Bot"
          >
            <Sparkles className="w-6 h-6 drop-shadow" />
          </Button>
          {/* botão peek — esconde/mostra para não atrapalhar */}
          <button
            onClick={(e) => { e.stopPropagation(); setHidden((v) => !v); }}
            title={hidden ? "Mostrar Sentinelle Bot" : "Esconder Sentinelle Bot"}
            className="absolute -top-1 -left-1 h-5 w-5 rounded-full bg-background border border-border text-[10px] leading-none text-muted-foreground hover:text-foreground hover:bg-muted shadow"
          >
            {hidden ? "›" : "‹"}
          </button>
        </div>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-lg flex flex-col p-0 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100 border-l border-blue-500/20"
        >
          {/* Header com gradient */}
          <SheetHeader className="relative p-5 border-b border-blue-500/20 bg-gradient-to-br from-blue-700 via-blue-600 to-cyan-600 overflow-hidden">
            <div
              className="absolute inset-0 opacity-20 pointer-events-none"
              style={{
                backgroundImage:
                  "linear-gradient(hsl(217,91%,80%) 1px, transparent 1px), linear-gradient(90deg, hsl(217,91%,80%) 1px, transparent 1px)",
                backgroundSize: "24px 24px",
              }}
            />
            <SheetTitle className="relative flex items-center gap-3 text-white">
              <div className="h-10 w-10 rounded-xl bg-white/15 backdrop-blur flex items-center justify-center shadow-inner border border-white/20">
                <Sparkles className="w-5 h-5" />
              </div>
              <div className="flex flex-col items-start">
                <span className="text-lg font-bold tracking-tight">Sentinelle Bot</span>
                <span className="text-[11px] text-blue-100/80 font-normal">
                  Assistente inteligente da Sentinelle
                </span>
              </div>
              <Badge className="ml-auto text-[10px] bg-white/15 text-white border-white/20 hover:bg-white/20">
                IA + Banco
              </Badge>
            </SheetTitle>
          </SheetHeader>

          <ScrollArea className="flex-1 px-4 py-4" ref={scrollRef as any}>
            <div className="space-y-3">
              {messages.length === 0 && (
                <div className="space-y-3">
                  <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
                    <p className="text-sm text-blue-100/90">
                      👋 Oi! Pergunte sobre <span className="font-semibold text-cyan-300">apoiadores</span>,{" "}
                      <span className="font-semibold text-cyan-300">métricas</span>,{" "}
                      <span className="font-semibold text-cyan-300">falas do candidato</span> ou peça sugestões.
                      Eu consulto os dados reais do seu cliente.
                    </p>
                  </div>
                  <p className="text-[11px] uppercase tracking-widest text-slate-400 px-1">Sugestões</p>
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="block w-full text-left text-sm p-3 rounded-lg border border-blue-500/20 bg-slate-900/60 hover:bg-blue-500/10 hover:border-blue-400/40 transition-colors text-slate-200"
                    >
                      <span className="text-cyan-400 mr-2">›</span>{s}
                    </button>
                  ))}
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm shadow-md ${
                      m.role === "user"
                        ? "bg-gradient-to-br from-blue-600 to-cyan-600 text-white rounded-br-sm"
                        : "bg-slate-800/80 border border-blue-500/15 text-slate-100 rounded-bl-sm"
                    }`}
                  >
                    {m.role === "assistant" ? (
                      <div className="prose prose-sm prose-invert max-w-none prose-p:my-1.5 prose-headings:text-cyan-300 prose-strong:text-white prose-a:text-cyan-400">
                        <ReactMarkdown>{m.content}</ReactMarkdown>
                        {m.tools && m.tools.length > 0 && (
                          <p className="text-[10px] text-blue-300/70 mt-2 not-prose">
                            🔧 {m.tools.map((t: any) => t.name).join(", ")}
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap">{m.content}</p>
                    )}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-slate-800/80 border border-blue-500/15 rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm flex items-center gap-2 text-slate-200">
                    <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                    <span className="text-slate-300">Sentinelle Bot pensando...</span>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          <div className="p-3 border-t border-blue-500/20 bg-slate-950/80 backdrop-blur flex gap-2">
            <Input
              placeholder="Pergunte algo ao Sentinelle Bot..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), send())}
              disabled={loading}
              className="bg-slate-900/80 border-blue-500/20 text-slate-100 placeholder:text-slate-500 focus-visible:ring-cyan-400/40"
            />
            <Button
              onClick={() => send()}
              disabled={loading || !input.trim()}
              size="icon"
              className="bg-gradient-to-br from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white shadow-md"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
