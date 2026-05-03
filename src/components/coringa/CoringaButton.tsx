import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Send, Loader2, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentClientId } from "@/hooks/ic/useCurrentClientId";
import { toast } from "sonner";

interface Msg { role: "user" | "assistant"; content: string; tools?: any[] }

export function CoringaButton() {
  const { data: clientId } = useCurrentClientId();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  if (!clientId) return null;

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    const newMsgs: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(newMsgs);
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("coringa-chat", {
        body: { clientId, message: text, history: messages },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply || "(sem resposta)", tools: data.tools_used }]);
    } catch (e: any) {
      toast.error(e.message || "Erro ao falar com o Coringa");
      setMessages((prev) => [...prev, { role: "assistant", content: "❌ " + (e.message || "Erro inesperado") }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        size="icon"
        className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full shadow-lg bg-primary hover:scale-105 transition-transform"
        title="Coringa — assistente IA"
      >
        <Sparkles className="w-6 h-6" />
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col p-0">
          <SheetHeader className="p-4 border-b">
            <SheetTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" /> Coringa
              <Badge variant="outline" className="text-[10px] ml-auto">IA c/ acesso ao banco</Badge>
            </SheetTitle>
            <p className="text-xs text-muted-foreground">
              Pergunte sobre apoiadores, métricas, falas do candidato, sugestões — eu consulto os dados reais.
            </p>
          </SheetHeader>

          <ScrollArea className="flex-1 p-4" ref={scrollRef as any}>
            <div className="space-y-3">
              {messages.length === 0 && (
                <div className="text-sm text-muted-foreground space-y-2">
                  <p>💡 Experimente:</p>
                  <button className="block text-left text-xs p-2 rounded border hover:bg-accent w-full" onClick={() => setInput("Quantos apoiadores temos no Aero Rancho?")}>"Quantos apoiadores temos no Aero Rancho?"</button>
                  <button className="block text-left text-xs p-2 rounded border hover:bg-accent w-full" onClick={() => setInput("O que o candidato falou sobre saúde nas últimas semanas?")}>"O que o candidato falou sobre saúde nas últimas semanas?"</button>
                  <button className="block text-left text-xs p-2 rounded border hover:bg-accent w-full" onClick={() => setInput("Quais alertas de crise estão ativos hoje?")}>"Quais alertas de crise estão ativos hoje?"</button>
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] rounded-lg p-3 text-sm ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                    {m.role === "assistant" ? (
                      <div className="prose prose-sm max-w-none dark:prose-invert">
                        <ReactMarkdown>{m.content}</ReactMarkdown>
                        {m.tools && m.tools.length > 0 && (
                          <p className="text-[10px] text-muted-foreground mt-2 not-prose">
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
                  <div className="bg-muted rounded-lg p-3 text-sm flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Coringa pensando...
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          <div className="p-3 border-t flex gap-2">
            <Input
              placeholder="Pergunte algo..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), send())}
              disabled={loading}
            />
            <Button onClick={send} disabled={loading || !input.trim()} size="icon">
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}