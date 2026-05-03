import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, FileText, Printer } from "lucide-react";
import { toast } from "sonner";
import type { Contratado } from "./useContratadosData";

interface TemplateOption { id: string; titulo: string; tipo: string; conteudo: string }

export default function ContractPrintDialog({
  contratado, clientName, liderName, clientId,
}: { contratado: Contratado; clientName: string; liderName?: string; clientId: string }) {
  const printRef = useRef<HTMLDivElement>(null);
  const today = new Date().toLocaleDateString("pt-BR");
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [renderedContent, setRenderedContent] = useState<string>("");

  useEffect(() => {
    supabase.from("contract_templates").select("id, titulo, tipo, conteudo")
      .eq("client_id", clientId).order("tipo").order("created_at")
      .then(({ data }) => {
        const tpls = (data || []) as any as TemplateOption[];
        setTemplates(tpls);
        if (tpls.length > 0) setSelectedTemplate(tpls[0].id);
      });
  }, [clientId]);

  useEffect(() => {
    const tpl = templates.find(t => t.id === selectedTemplate);
    if (!tpl) { setRenderedContent(""); return; }
    const socials = Array.isArray(contratado.redes_sociais) ? contratado.redes_sociais : [];
    const socialsStr = socials.map((s: any) => `@${s.usuario} (${s.plataforma})`).join(", ") || "Não informado";
    const content = tpl.conteudo
      .replace(/\{nome\}/g, contratado.nome)
      .replace(/\{telefone\}/g, contratado.telefone)
      .replace(/\{email\}/g, contratado.email || "Não informado")
      .replace(/\{endereco\}/g, contratado.endereco || "Não informado")
      .replace(/\{cidade\}/g, contratado.cidade || "Não informada")
      .replace(/\{bairro\}/g, contratado.bairro || "Não informado")
      .replace(/\{zona_eleitoral\}/g, contratado.zona_eleitoral || "Não informada")
      .replace(/\{lider\}/g, liderName || "Sem líder")
      .replace(/\{contratante\}/g, clientName)
      .replace(/\{data\}/g, today)
      .replace(/\{redes_sociais\}/g, socialsStr);
    setRenderedContent(content);
  }, [selectedTemplate, templates, contratado, clientName, liderName, today]);

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    const win = window.open("", "_blank");
    if (!win) { toast.error("Permita pop-ups para imprimir."); return; }
    win.document.write(`<html><head><title>Contrato - ${contratado.nome}</title>
      <style>body{font-family:Arial,sans-serif;padding:40px;font-size:14px;line-height:1.6;color:#222;white-space:pre-wrap}@media print{body{padding:20px}}</style>
      </head><body>${content.innerText}</body></html>`);
    win.document.close();
    setTimeout(() => win.print(), 500);
  };

  const handleAcceptContract = async () => {
    await supabase.from("contratados").update({
      contrato_aceito: true, contrato_aceito_em: new Date().toISOString(),
    } as any).eq("id", contratado.id);
    toast.success("Contrato marcado como assinado!");
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5"><Printer className="w-3.5 h-3.5" />Contrato</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileText className="w-5 h-5" />Contrato de {contratado.nome}</DialogTitle>
        </DialogHeader>
        {templates.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground text-sm">
            <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p>Nenhum modelo de contrato criado.</p>
            <p className="text-xs mt-1">Crie um modelo na seção "Modelos de Contrato".</p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-2">
              <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
                <SelectTrigger className="flex-1"><SelectValue placeholder="Selecione o modelo" /></SelectTrigger>
                <SelectContent>
                  {templates.map(t => (
                    <SelectItem key={t.id} value={t.id}>[{t.tipo === "lider" ? "Líder" : "Liderado"}] {t.titulo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 mb-4">
              <Button onClick={handlePrint} className="gap-2"><Printer className="w-4 h-4" />Imprimir</Button>
              {!contratado.contrato_aceito && (
                <Button variant="outline" onClick={handleAcceptContract} className="gap-2"><CheckCircle2 className="w-4 h-4" />Marcar como Assinado</Button>
              )}
              {contratado.contrato_aceito && (
                <Badge className="gap-1 self-center"><CheckCircle2 className="w-3 h-3" />Assinado em {new Date(contratado.contrato_aceito_em!).toLocaleDateString("pt-BR")}</Badge>
              )}
            </div>
            <div ref={printRef} className="border rounded-lg p-6 bg-white text-foreground text-sm leading-relaxed whitespace-pre-wrap font-mono">
              {renderedContent}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
