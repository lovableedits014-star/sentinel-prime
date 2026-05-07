import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Loader2, Upload, FileUp, Link as LinkIcon, NotebookPen, Plus, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

type Phase = "idle" | "uploading" | "extracting" | "analyzing" | "done" | "error";

interface Props {
  clientId: string;
  trigger?: React.ReactNode;
}

export function IngestDocumentDialog({ clientId, trigger }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"pdf" | "url" | "manual">("pdf");

  // pdf
  const [file, setFile] = useState<File | null>(null);
  // url
  const [url, setUrl] = useState("");
  // manual
  const [manualText, setManualText] = useState("");
  // comum
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");

  // progresso/erro
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [statusMsg, setStatusMsg] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (progressTimer.current) clearInterval(progressTimer.current); }, []);

  const stopAutoProgress = () => {
    if (progressTimer.current) { clearInterval(progressTimer.current); progressTimer.current = null; }
  };
  const startAutoProgress = (cap: number) => {
    stopAutoProgress();
    progressTimer.current = setInterval(() => {
      setProgress((p) => (p < cap ? p + Math.max(1, Math.round((cap - p) / 14)) : p));
    }, 500);
  };

  const reset = () => {
    setFile(null); setUrl(""); setManualText("");
    setTitle(""); setDate(""); setTab("pdf");
    setPhase("idle"); setProgress(0); setStatusMsg(""); setErrorMsg(null);
    stopAutoProgress();
  };

  const ingest = useMutation({
    mutationFn: async () => {
      setErrorMsg(null);
      setProgress(2);
      const payload: any = {
        clientId,
        mode: tab,
        title: title || undefined,
        date: date || undefined,
      };

      if (tab === "pdf") {
        if (!file) throw new Error("Selecione um arquivo PDF");
        if (file.size > 20 * 1024 * 1024) throw new Error("PDF maior que 20MB");
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth.user?.id;
        if (!uid) throw new Error("Usuário não autenticado");
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${uid}/${clientId}/${Date.now()}_${safeName}`;
        setPhase("uploading");
        setStatusMsg("Enviando PDF…");
        startAutoProgress(35);
        const up = await supabase.storage.from("ic-documents").upload(path, file, {
          contentType: "application/pdf",
        });
        if (up.error) throw new Error(`Upload falhou: ${up.error.message}`);
        payload.storagePath = path;
        setProgress(40);
      } else if (tab === "url") {
        const u = url.trim();
        if (!/^https?:\/\//i.test(u)) throw new Error("URL inválida (http/https)");
        payload.url = u;
        setProgress(15);
      } else {
        if (manualText.trim().length < 30) throw new Error("Nota muito curta (mín 30 caracteres)");
        payload.text = manualText.trim();
        setProgress(15);
      }

      setPhase("extracting");
      setStatusMsg(tab === "url" ? "Buscando e extraindo conteúdo da URL…" : tab === "pdf" ? "Extraindo texto do PDF…" : "Processando texto…");
      startAutoProgress(75);

      const { data, error } = await supabase.functions.invoke("ic-ingest-document", { body: payload });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      setPhase("analyzing");
      setStatusMsg("Analisando fatos, promessas e insights com IA…");
      startAutoProgress(95);
      return data;
    },
    onSuccess: (data: any) => {
      stopAutoProgress();
      setProgress(100);
      setPhase("done");
      const msg = `Documento ingerido — ${data?.extracted ?? 0} fatos extraídos`;
      setStatusMsg(`${msg}. Promessas e insights atualizando em segundo plano…`);
      toast.success(msg);
      const refresh = () => {
        qc.invalidateQueries({ queryKey: ["ic-documents", clientId] });
        qc.invalidateQueries({ queryKey: ["ic-knowledge", clientId] });
        qc.invalidateQueries({ queryKey: ["ic-promessas", clientId] });
        qc.invalidateQueries({ queryKey: ["ic-insights", clientId] });
        qc.invalidateQueries({ queryKey: ["ic-cobertura", clientId] });
      };
      refresh();
      setTimeout(refresh, 6000);
      setTimeout(refresh, 20000);
      setTimeout(() => { setOpen(false); reset(); }, 1800);
    },
    onError: (e: any) => {
      stopAutoProgress();
      const msg = e?.message || "Falha ao ingerir documento";
      setErrorMsg(msg);
      setPhase("error");
      setStatusMsg("");
      toast.error(msg);
    },
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="default">
            <Plus className="w-4 h-4 mr-1.5" /> Adicionar documento
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileUp className="w-4 h-4 text-primary" />
            Adicionar à memória
          </DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="pdf"><FileUp className="w-3.5 h-3.5 mr-1.5" />PDF</TabsTrigger>
            <TabsTrigger value="url"><LinkIcon className="w-3.5 h-3.5 mr-1.5" />URL</TabsTrigger>
            <TabsTrigger value="manual"><NotebookPen className="w-3.5 h-3.5 mr-1.5" />Nota</TabsTrigger>
          </TabsList>

          <TabsContent value="pdf" className="space-y-3 mt-4">
            <div>
              <Label htmlFor="pdf-file">Arquivo PDF (até 20MB)</Label>
              <Input
                id="pdf-file" type="file" accept="application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              {file && <p className="text-xs text-muted-foreground mt-1">{file.name} — {(file.size / 1024).toFixed(0)} KB</p>}
            </div>
            <p className="text-xs text-muted-foreground">
              Programa de governo, plano, manifesto, ata, dossiê — qualquer documento que vire memória do candidato.
            </p>
          </TabsContent>

          <TabsContent value="url" className="space-y-3 mt-4">
            <div>
              <Label htmlFor="url-input">URL pública</Label>
              <Input
                id="url-input" type="url" placeholder="https://..."
                value={url} onChange={(e) => setUrl(e.target.value)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Matéria de jornal, post de blog, página oficial. Vamos buscar o HTML e extrair o conteúdo.
            </p>
          </TabsContent>

          <TabsContent value="manual" className="space-y-3 mt-4">
            <div>
              <Label htmlFor="manual-text">Texto livre</Label>
              <Textarea
                id="manual-text" rows={8} placeholder="Cole ou escreva o conteúdo..."
                value={manualText} onChange={(e) => setManualText(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">{manualText.length} caracteres (mín. 30)</p>
            </div>
          </TabsContent>
        </Tabs>

        <div className="grid grid-cols-2 gap-3 pt-2">
          <div>
            <Label htmlFor="doc-title">Título (opcional)</Label>
            <Input id="doc-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Plano de Governo 2024" />
          </div>
          <div>
            <Label htmlFor="doc-date">Data do evento (opcional)</Label>
            <Input id="doc-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>

        {(phase !== "idle" || progress > 0) && (
          <div className="space-y-1.5 pt-1">
            <Progress value={progress} className="h-1.5" />
            {statusMsg && (
              <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                {(phase === "uploading" || phase === "extracting" || phase === "analyzing") && <Loader2 className="w-3 h-3 animate-spin" />}
                {phase === "done" && <CheckCircle2 className="w-3 h-3 text-emerald-600" />}
                {statusMsg}
              </p>
            )}
          </div>
        )}

        {errorMsg && phase === "error" && (
          <div className="rounded-md border border-red-500/40 bg-red-500/5 p-2.5 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-red-700 dark:text-red-400">Falha ao ingerir documento</p>
              <p className="text-xs text-muted-foreground break-words">{errorMsg}</p>
            </div>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => ingest.mutate()}>Tentar novamente</Button>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={ingest.isPending}>
            {phase === "done" ? "Fechar" : "Cancelar"}
          </Button>
          <Button onClick={() => ingest.mutate()} disabled={ingest.isPending || phase === "done"}>
            {ingest.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Upload className="w-4 h-4 mr-1.5" />}
            {ingest.isPending ? "Processando…" : "Ingerir e analisar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
