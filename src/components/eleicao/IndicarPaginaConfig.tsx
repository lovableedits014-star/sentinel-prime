import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2, Upload, Trash2, Palette, Eye, RotateCcw } from "lucide-react";

const BUCKET = "candidate-identity";
const MAX_BYTES = 4 * 1024 * 1024;

type Cfg = {
  page_logo_url: string | null;
  page_saudacao: string | null;
  page_subtitulo: string | null;
  page_funcao_label: string | null;
  page_progresso_titulo: string | null;
  page_botao_label: string | null;
  page_rodape: string | null;
};

const DEFAULTS: Cfg = {
  page_logo_url: null,
  page_saudacao: "Olá, {nome}!",
  page_subtitulo: "Cadastre quem você sabe que vai votar em {candidato}.",
  page_funcao_label: "Sua função:",
  page_progresso_titulo: "Suas indicações",
  page_botao_label: "Indicar e adicionar outra",
  page_rodape: "Esse link é pessoal e exclusivo seu. Não compartilhe com terceiros.",
};

export default function IndicarPaginaConfig({ clientId, candidatoNome }: { clientId: string; candidatoNome: string }) {
  const [cfg, setCfg] = useState<Cfg>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("eleicao_indicacao_config")
      .select("page_logo_url,page_saudacao,page_subtitulo,page_funcao_label,page_progresso_titulo,page_botao_label,page_rodape")
      .eq("client_id", clientId)
      .maybeSingle();
    if (data) {
      setCfg({
        page_logo_url: (data as any).page_logo_url ?? null,
        page_saudacao: (data as any).page_saudacao ?? DEFAULTS.page_saudacao,
        page_subtitulo: (data as any).page_subtitulo ?? DEFAULTS.page_subtitulo,
        page_funcao_label: (data as any).page_funcao_label ?? DEFAULTS.page_funcao_label,
        page_progresso_titulo: (data as any).page_progresso_titulo ?? DEFAULTS.page_progresso_titulo,
        page_botao_label: (data as any).page_botao_label ?? DEFAULTS.page_botao_label,
        page_rodape: (data as any).page_rodape ?? DEFAULTS.page_rodape,
      });
    }
    setLoading(false);
  }
  useEffect(() => { if (clientId) load(); }, [clientId]);

  async function uploadLogo(file: File) {
    if (file.size > MAX_BYTES) { toast.error("Imagem grande demais (máx. 4 MB)"); return; }
    setUploading(true);
    try {
      const ext = (file.name.split(".").pop() || "png").toLowerCase();
      const path = `${clientId}/indicar-logo-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
        cacheControl: "3600", upsert: false, contentType: file.type || "image/png",
      });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
      setCfg((c) => ({ ...c, page_logo_url: pub.publicUrl }));
      toast.success("Logo enviada — clique em Salvar para aplicar");
    } catch (e: any) {
      toast.error(e?.message || "Falha ao enviar imagem");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function salvar() {
    setSaving(true);
    const { error } = await supabase.from("eleicao_indicacao_config").upsert({
      client_id: clientId,
      ...cfg,
      ativo: true,
    } as any, { onConflict: "client_id" });
    setSaving(false);
    if (error) { toast.error("Falha ao salvar"); return; }
    toast.success("Página atualizada");
  }

  function resetar() {
    setCfg((c) => ({ ...DEFAULTS, page_logo_url: c.page_logo_url }));
  }

  // Preview
  const previewNome = "Maria Silva";
  const previewCand = candidatoNome || "seu candidato";
  const render = (tpl: string | null, fallback: string) =>
    (tpl || fallback)
      .replace(/\{nome\}/g, previewNome)
      .replace(/\{primeiro_nome\}/g, previewNome.split(" ")[0])
      .replace(/\{candidato\}/g, previewCand);

  if (loading) return <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      {/* FORM */}
      <Card className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold flex items-center gap-2"><Palette className="w-4 h-4" />Personalizar página de indicação</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Esses textos aparecem quando o indicador (coordenador / líder / cabo) abre o link pessoal dele.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={resetar} title="Restaurar textos padrão">
            <RotateCcw className="w-4 h-4 mr-1.5" />Padrão
          </Button>
        </div>

        {/* Logo */}
        <div className="space-y-2">
          <Label className="text-xs">Logo do topo da página</Label>
          <div className="flex items-center gap-3">
            <div className="w-20 h-20 rounded-md border bg-muted/40 flex items-center justify-center overflow-hidden">
              {cfg.page_logo_url
                ? <img src={cfg.page_logo_url} alt="" className="w-full h-full object-contain" />
                : <span className="text-[10px] text-muted-foreground text-center px-1">sem logo<br />(usará a do candidato)</span>}
            </div>
            <div className="flex flex-col gap-1.5">
              <input ref={fileRef} type="file" accept="image/*" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadLogo(f); }} />
              <Button type="button" size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Upload className="w-4 h-4 mr-1.5" />}
                Enviar imagem
              </Button>
              {cfg.page_logo_url && (
                <Button type="button" size="sm" variant="ghost"
                  onClick={() => setCfg((c) => ({ ...c, page_logo_url: null }))}>
                  <Trash2 className="w-4 h-4 mr-1.5" />Remover
                </Button>
              )}
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">PNG transparente, idealmente 200–400px de largura. Máx. 4 MB.</p>
        </div>

        <div>
          <Label className="text-xs">Saudação</Label>
          <Input value={cfg.page_saudacao ?? ""} onChange={(e) => setCfg({ ...cfg, page_saudacao: e.target.value })}
            placeholder={DEFAULTS.page_saudacao!} />
          <p className="text-[11px] text-muted-foreground mt-1">Use <code>{"{nome}"}</code> para o nome do indicador.</p>
        </div>

        <div>
          <Label className="text-xs">Subtítulo / chamada</Label>
          <Textarea rows={2} value={cfg.page_subtitulo ?? ""} onChange={(e) => setCfg({ ...cfg, page_subtitulo: e.target.value })}
            placeholder={DEFAULTS.page_subtitulo!} />
          <p className="text-[11px] text-muted-foreground mt-1">Use <code>{"{candidato}"}</code> para o nome da campanha.</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Rótulo "função"</Label>
            <Input value={cfg.page_funcao_label ?? ""} onChange={(e) => setCfg({ ...cfg, page_funcao_label: e.target.value })}
              placeholder={DEFAULTS.page_funcao_label!} />
          </div>
          <div>
            <Label className="text-xs">Título do contador</Label>
            <Input value={cfg.page_progresso_titulo ?? ""} onChange={(e) => setCfg({ ...cfg, page_progresso_titulo: e.target.value })}
              placeholder={DEFAULTS.page_progresso_titulo!} />
          </div>
        </div>

        <div>
          <Label className="text-xs">Texto do botão</Label>
          <Input value={cfg.page_botao_label ?? ""} onChange={(e) => setCfg({ ...cfg, page_botao_label: e.target.value })}
            placeholder={DEFAULTS.page_botao_label!} />
        </div>

        <div>
          <Label className="text-xs">Rodapé</Label>
          <Textarea rows={2} value={cfg.page_rodape ?? ""} onChange={(e) => setCfg({ ...cfg, page_rodape: e.target.value })}
            placeholder={DEFAULTS.page_rodape!} />
        </div>

        <div className="flex justify-end">
          <Button onClick={salvar} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Salvar página
          </Button>
        </div>
      </Card>

      {/* PREVIEW */}
      <div className="space-y-2">
        <div className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Eye className="w-3.5 h-3.5" /> Pré-visualização (com nome de exemplo)
        </div>
        <Card className="p-0 overflow-hidden bg-gradient-to-b from-primary/5 via-background to-background">
          <div className="p-5 max-w-sm mx-auto">
            <div className="text-center mb-4">
              {cfg.page_logo_url && (
                <img src={cfg.page_logo_url} alt="" className="h-16 mx-auto mb-3 object-contain" />
              )}
              <h1 className="text-lg font-bold leading-tight">
                {render(cfg.page_saudacao, DEFAULTS.page_saudacao!)}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                {render(cfg.page_subtitulo, DEFAULTS.page_subtitulo!)}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">
                {cfg.page_funcao_label || DEFAULTS.page_funcao_label} Coordenador(a)
              </p>
            </div>

            <Card className="p-4 mb-3">
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-sm text-muted-foreground">{cfg.page_progresso_titulo || DEFAULTS.page_progresso_titulo}</span>
                <span className="text-2xl font-bold">12<span className="text-sm text-muted-foreground font-normal"> / 30</span></span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary" style={{ width: "40%" }} />
              </div>
            </Card>

            <Card className="p-4 mb-3">
              <div className="space-y-2">
                <div className="h-10 rounded-md border bg-muted/20" />
                <div className="h-10 rounded-md border bg-muted/20" />
                <Button className="w-full h-11" disabled>
                  {cfg.page_botao_label || DEFAULTS.page_botao_label}
                </Button>
              </div>
            </Card>

            <p className="text-[10px] text-center text-muted-foreground">
              {cfg.page_rodape || DEFAULTS.page_rodape}
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
