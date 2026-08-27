import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { FacebookIcon, InstagramIcon } from "@/components/icons/SocialIcons";
import { Check, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { detectLinkKind, isValidHttpUrl } from "@/lib/mission-link-kind";

type PostOption = {
  post_id: string;
  post_message: string | null;
  post_permalink_url: string | null;
  post_full_picture: string | null;
  platform: string;
  comment_created_time?: string | null;
};

type Props = {
  clientId: string;
  onCreated: (missionId: string) => void;
};

function parsePlatformFromUrl(url: string): "facebook" | "instagram" | null {
  if (!url) return null;
  if (url.includes("facebook.com") || url.includes("fb.com") || url.includes("fb.watch")) return "facebook";
  if (url.includes("instagram.com")) return "instagram";
  return null;
}

function getProjectRef(baseUrl: string): string | null {
  try {
    const hostname = new URL(baseUrl).hostname;
    return hostname.endsWith(".supabase.co") ? hostname.split(".")[0] || null : null;
  } catch {
    return null;
  }
}

function getStoredAccessToken(baseUrl: string): string | null {
  try {
    const projectRef = getProjectRef(baseUrl);
    if (!projectRef) return null;
    const raw = localStorage.getItem(`sb-${projectRef}-auth-token`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      access_token?: string;
      currentSession?: { access_token?: string };
    };
    return parsed.currentSession?.access_token || parsed.access_token || null;
  } catch {
    // O chamador exibe uma mensagem de sessão expirada.
  }
  return null;
}

type MissionRpcResult = { ok?: boolean; mission_id?: string; links_created?: number };

async function createTrackedMissionRaw(payload: Record<string, unknown>, diagnosticId: string) {
  const baseUrl = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, "");
  const apiKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!baseUrl || !apiKey) throw new Error("Configuração do banco indisponível");
  const accessToken = getStoredAccessToken(baseUrl);
  if (!accessToken) throw new Error("Sessão não encontrada. Saia, entre novamente e repita a operação.");

  const response = await fetch(`${baseUrl}/rest/v1/rpc/create_tracked_mission`, {
    method: "POST",
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Client-Info": `sentinel-prime-mission/${diagnosticId}`,
    },
    body: JSON.stringify(payload),
  });
  const responseText = await response.text();
  const requestId = response.headers.get("x-request-id") || response.headers.get("cf-ray") || "sem-request-id";

  if (!response.ok) {
    let serverMessage = responseText.trim() || `HTTP ${response.status}`;
    try {
      const parsed = JSON.parse(responseText) as { message?: string; details?: string; hint?: string };
      serverMessage = parsed.message || parsed.details || parsed.hint || serverMessage;
    } catch {
      // Preserva a resposta original quando o gateway não devolve JSON.
    }
    throw new Error(`${serverMessage} (HTTP ${response.status}; req ${requestId})`);
  }

  if (!responseText.trim()) {
    throw new Error(`O banco respondeu sucesso sem conteúdo (HTTP ${response.status}; req ${requestId})`);
  }
  try {
    return JSON.parse(responseText) as MissionRpcResult;
  } catch {
    throw new Error(
      `Resposta inválida do banco (HTTP ${response.status}; ${response.headers.get("content-type") || "sem content-type"}; req ${requestId})`,
    );
  }
}

async function confirmMissionExists(missionId: string, clientId: string) {
  const baseUrl = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, "");
  const apiKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!baseUrl || !apiKey) return false;
  const accessToken = getStoredAccessToken(baseUrl);
  if (!accessToken) return false;
  const query = new URLSearchParams({ select: "id", id: `eq.${missionId}`, client_id: `eq.${clientId}`, limit: "1" });
  const response = await fetch(`${baseUrl}/rest/v1/portal_missions?${query}`, {
    headers: { apikey: apiKey, Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  if (!response.ok) return false;
  try {
    const rows = JSON.parse(await response.text()) as Array<{ id?: string }>;
    return rows.some((row) => row.id === missionId);
  } catch {
    return false;
  }
}

export default function MissionFromPostDialog({ clientId, onCreated }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [fb, setFb] = useState<PostOption | null>(null);
  const [ig, setIg] = useState<PostOption | null>(null);
  const [manualUrl, setManualUrl] = useState("");
  const [extraLabel, setExtraLabel] = useState("");
  const [extraUrl, setExtraUrl] = useState("");
  const [extraLinks, setExtraLinks] = useState<{ label: string; url: string }[]>([]);
  const [titulo, setTitulo] = useState("");
  const [instrucoes, setInstrucoes] = useState("");
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const { data: posts = [], isLoading, refetch } = useQuery<PostOption[]>({
    queryKey: ["checkin-post-options", clientId],
    queryFn: async () => {
      const cols = "post_id, post_message, post_permalink_url, post_full_picture, platform, comment_created_time";
      const [{ data: stubs }, { data: rows }] = await Promise.all([
        supabase.from("comments").select(cols).eq("client_id", clientId)
          .like("comment_id", "post_stub_%").not("post_permalink_url", "is", null)
          .order("comment_created_time", { ascending: false }).limit(100),
        supabase.from("comments").select(cols).eq("client_id", clientId)
          .not("post_permalink_url", "is", null)
          .order("comment_created_time", { ascending: false }).limit(1000),
      ]);
      const seen = new Set<string>();
      const unique: PostOption[] = [];
      for (const row of [...(stubs || []), ...(rows || [])] as PostOption[]) {
        if (!row.post_id || seen.has(row.post_id)) continue;
        seen.add(row.post_id);
        unique.push(row as PostOption);
      }
      return unique;
    },
    enabled: !!clientId && open,
  });

  const sync = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const { error } = await supabase.functions.invoke("fetch-meta-comments", { body: { clientId } });
      if (error) throw error;
      await refetch();
      toast.success("Publicações sincronizadas!");
    } catch {
      await refetch();
      toast.error("Não foi possível sincronizar com a Meta agora — mostrando o que já está carregado.");
    } finally {
      setSyncing(false);
    }
  };

  const fbPosts = posts.filter((p) => p.platform === "facebook");
  const igPosts = posts.filter((p) => p.platform === "instagram");

  const reset = () => {
    setFb(null); setIg(null); setManualUrl(""); setTitulo(""); setInstrucoes("");
    setExtraLabel(""); setExtraUrl(""); setExtraLinks([]);
  };

  const addExtraLink = () => {
    const u = extraUrl.trim();
    if (!isValidHttpUrl(u)) {
      toast.error("Informe um endereço começando com https://");
      return;
    }
    setExtraLinks((prev) => [...prev, { label: extraLabel.trim() || "Abrir link", url: u }]);
    setExtraLabel("");
    setExtraUrl("");
  };

  const criar = async () => {
    const linkFb = fb?.post_permalink_url || null;
    const linkIg = ig?.post_permalink_url || null;
    const manual = manualUrl.trim();
    let linksToCreate = [...extraLinks];
    let extraFb = linkFb, extraIg = linkIg;
    if (manual) {
      if (!isValidHttpUrl(manual)) { toast.error("Informe um endereço começando com https://"); return; }
      const det = parsePlatformFromUrl(manual);
      if (det === "facebook" && !extraFb) extraFb = manual;
      if (det === "instagram" && !extraIg) extraIg = manual;
      if (!det) linksToCreate = [{ label: titulo.trim() || "Abrir link", url: manual }, ...linksToCreate];
    }
    const postUrl = extraFb || extraIg || linksToCreate[0]?.url;
    if (!postUrl) {
      toast.error("Escolha uma publicação, cole o link do post ou adicione ao menos um link externo");
      return;
    }
    const platform: "facebook" | "instagram" = extraIg && !extraFb ? "instagram" : "facebook";
    const autoTitle =
      titulo.trim() ||
      (fb?.post_message || ig?.post_message || "").slice(0, 60).trim() ||
      `Missão ${new Date().toLocaleDateString("pt-BR")}`;

    setSaving(true);
    const diagnosticId = crypto.randomUUID().slice(0, 8);
    try {
      const payload = {
        p_client_id: clientId,
        p_platform: platform,
        p_post_url: postUrl,
        p_title: autoTitle,
        p_instructions: instrucoes.trim() || null,
        p_link_facebook: extraFb,
        p_link_instagram: extraIg,
        p_links: linksToCreate.map((link) => ({
          label: link.label,
          url: link.url,
          kind: detectLinkKind(link.url),
        })),
      };
      const result = await createTrackedMissionRaw(payload, diagnosticId);
      if (!result?.ok || !result.mission_id) throw new Error("O banco não retornou o ID da missão criada");
      const missionId = result.mission_id;
      if (!(await confirmMissionExists(missionId, clientId))) {
        throw new Error("A operação respondeu sucesso, mas a missão não foi encontrada na conferência final");
      }
      qc.invalidateQueries({ queryKey: ["checkin-missions", clientId] });
      qc.invalidateQueries({ queryKey: ["portal-missions", clientId] });
      toast.success("Missão criada com rastreamento — gere o link abaixo e envie no grupo.");
      setOpen(false);
      reset();
      onCreated(missionId);
    } catch (e: unknown) {
      const error = e as { code?: string; message?: string; details?: string; hint?: string };
      console.error("[create_tracked_mission]", {
        diagnosticId,
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
      const detail = error.message || error.details || "falha desconhecida";
      toast.error(`Erro ao criar missão [${diagnosticId}]: ${detail}`);
    } finally {
      setSaving(false);
    }
  };

  const PostList = ({ list, selected, onSelect, icon }: {
    list: PostOption[]; selected: PostOption | null;
    onSelect: (p: PostOption | null) => void; icon: React.ReactNode;
  }) => (
    <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
      {isLoading && (
        <div className="py-8 text-center"><Loader2 className="mx-auto h-4 w-4 animate-spin text-muted-foreground" /></div>
      )}
      {!isLoading && list.length === 0 && (
        <p className="py-6 text-center text-xs text-muted-foreground">
          Nenhuma publicação encontrada. Clique em “Sincronizar publicações”.
        </p>
      )}
      {list.map((p) => {
        const active = selected?.post_id === p.post_id;
        return (
          <button
            key={p.post_id}
            type="button"
            onClick={() => onSelect(active ? null : p)}
            className={`flex w-full items-start gap-3 rounded-lg border p-2 text-left transition ${
              active ? "border-primary bg-primary/5" : "hover:bg-muted/50"
            }`}
          >
            {p.post_full_picture ? (
              <img src={p.post_full_picture} alt="" className="h-12 w-12 rounded object-cover" loading="lazy" />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded bg-muted">{icon}</div>
            )}
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-xs">{p.post_message || "(sem legenda)"}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {p.comment_created_time ? new Date(p.comment_created_time).toLocaleString("pt-BR") : ""}
              </p>
            </div>
            {active && <Check className="mt-1 h-4 w-4 shrink-0 text-primary" />}
          </button>
        );
      })}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5"><Plus className="h-4 w-4" /> Nova missão rastreada</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova missão rastreada</DialogTitle>
          <DialogDescription>
            Selecione uma publicação do Facebook/Instagram ou cadastre links externos. Depois basta gerar
            o link de envio e jogar no grupo.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between">
          <div className="flex flex-wrap gap-1.5 text-xs">
            {fb && <Badge variant="secondary" className="gap-1"><FacebookIcon className="h-3 w-3" /> Facebook selecionado</Badge>}
            {ig && <Badge variant="secondary" className="gap-1"><InstagramIcon className="h-3 w-3" /> Instagram selecionado</Badge>}
          </div>
          <Button variant="outline" size="sm" onClick={sync} disabled={syncing} className="gap-1.5">
            {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Sincronizar publicações
          </Button>
        </div>

        <Tabs defaultValue="facebook">
          <TabsList>
            <TabsTrigger value="facebook" className="gap-1.5 text-xs"><FacebookIcon className="h-3.5 w-3.5" /> Facebook</TabsTrigger>
            <TabsTrigger value="instagram" className="gap-1.5 text-xs"><InstagramIcon className="h-3.5 w-3.5" /> Instagram</TabsTrigger>
          </TabsList>
          <TabsContent value="facebook">
            <PostList list={fbPosts} selected={fb} onSelect={setFb} icon={<FacebookIcon className="h-5 w-5" />} />
          </TabsContent>
          <TabsContent value="instagram">
            <PostList list={igPosts} selected={ig} onSelect={setIg} icon={<InstagramIcon className="h-5 w-5" />} />
          </TabsContent>
        </Tabs>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Nome da missão (opcional)</Label>
            <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Compartilhar vídeo da saúde" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Ou cole o link da publicação</Label>
            <Input value={manualUrl} onChange={(e) => setManualUrl(e.target.value)} placeholder="https://facebook.com/..." />
          </div>
        </div>

        <div className="space-y-2 rounded-lg border p-3">
          <div>
            <Label className="text-xs font-medium">Links da missão (opcional, quantos quiser)</Label>
            <p className="text-[11px] text-muted-foreground">
              Qualquer link externo — site, notícia, YouTube, TikTok, formulário. Dá para criar a missão só com
              links, sem publicação da Meta. Se preferir, cole um link externo direto no campo acima.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
            <Input value={extraLabel} onChange={(e) => setExtraLabel(e.target.value)} placeholder="Nome do botão" />
            <Input value={extraUrl} onChange={(e) => setExtraUrl(e.target.value)} placeholder="https://..." />
            <Button type="button" variant="outline" className="gap-1.5" onClick={addExtraLink} disabled={!extraUrl.trim()}>
              <Plus className="h-4 w-4" /> Adicionar link
            </Button>
          </div>
          {extraLinks.length > 0 && (
            <div className="space-y-1.5">
              {extraLinks.map((l, i) => (
                <div key={`${l.url}-${i}`} className="flex items-center gap-2 rounded border px-2 py-1 text-xs">
                  <Badge variant="secondary" className="text-[10px]">{detectLinkKind(l.url)}</Badge>
                  <span className="font-medium">{l.label}</span>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">{l.url}</span>
                  <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive"
                    onClick={() => setExtraLinks((prev) => prev.filter((_, idx) => idx !== i))}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Instruções para a pessoa (opcional)</Label>
          <Textarea
            rows={2}
            value={instrucoes}
            onChange={(e) => setInstrucoes(e.target.value)}
            placeholder="Curta, comente e compartilhe no seu perfil e nos grupos."
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={criar} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Criar missão rastreada
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
