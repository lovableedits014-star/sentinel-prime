import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Loader2, Save, Eye, EyeOff, Server, Globe, Send,
  ChevronDown, ChevronUp
} from "lucide-react";

interface ClientBridgeConfig {
  id: string;
  name: string;
  whatsapp_bridge_url: string | null;
  whatsapp_bridge_api_key: string | null;
}

export default function UazapiConfigPanel() {
  const [clients, setClients] = useState<ClientBridgeConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editUrl, setEditUrl] = useState("");
  const [editKey, setEditKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    loadClients();
  }, []);

  const loadClients = async () => {
    const { data } = await supabase
      .from("clients")
      .select("id, name, whatsapp_bridge_url, whatsapp_bridge_api_key")
      .order("created_at", { ascending: false });
    setClients((data as any[]) || []);
    setLoading(false);
  };

  const handleExpand = (client: ClientBridgeConfig) => {
    if (expandedId === client.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(client.id);
    setEditUrl(client.whatsapp_bridge_url || "");
    setEditKey(client.whatsapp_bridge_api_key || "");
    setShowKey(false);
    setTestPhone("");
  };

  const handleSave = async (clientId: string) => {
    if (!editUrl.trim()) {
      toast.error("URL da Ponte API é obrigatória");
      return;
    }
    if (!editKey.trim()) {
      toast.error("Chave da API é obrigatória");
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from("clients")
      .update({
        whatsapp_bridge_url: editUrl.trim(),
        whatsapp_bridge_api_key: editKey.trim(),
      } as any)
      .eq("id", clientId);

    if (error) {
      toast.error("Erro ao salvar: " + error.message);
    } else {
      toast.success("Ponte WhatsApp salva para este cliente!");
      setClients((prev) =>
        prev.map((c) =>
          c.id === clientId
            ? { ...c, whatsapp_bridge_url: editUrl.trim(), whatsapp_bridge_api_key: editKey.trim() }
            : c
        )
      );
    }
    setSaving(false);
  };

  const handleRemove = async (clientId: string) => {
    setSaving(true);
    const { error } = await supabase
      .from("clients")
      .update({
        whatsapp_bridge_url: null,
        whatsapp_bridge_api_key: null,
      } as any)
      .eq("id", clientId);

    if (error) {
      toast.error("Erro ao remover: " + error.message);
    } else {
      toast.success("Ponte removida deste cliente");
      setClients((prev) =>
        prev.map((c) =>
          c.id === clientId
            ? { ...c, whatsapp_bridge_url: null, whatsapp_bridge_api_key: null }
            : c
        )
      );
      setEditUrl("");
      setEditKey("");
    }
    setSaving(false);
  };

  const handleTest = async (clientId: string) => {
    const phone = testPhone.replace(/\D/g, "");
    if (!phone || phone.length < 10) {
      toast.error("Digite um número válido com DDI + DDD");
      return;
    }
    setTesting(true);
    try {
      const res = await supabase.functions.invoke("manage-whatsapp-instance", {
        body: {
          action: "test_send",
          client_id: clientId,
          phone,
          message: "✅ Teste da Ponte WhatsApp — Sentinelle. Integração funcionando!",
        },
      });
      if (!res.error) {
        toast.success("Mensagem de teste enviada!");
      } else {
        toast.error("Falha: " + (res.data?.error || res.error.message));
      }
    } catch (err: any) {
      toast.error("Erro: " + err.message);
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <Card className="bg-slate-800/60 border-slate-700">
        <CardContent className="py-8 flex justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
        </CardContent>
      </Card>
    );
  }

  const configuredCount = clients.filter((c) => c.whatsapp_bridge_url && c.whatsapp_bridge_api_key).length;

  return (
    <Card className="bg-slate-800/60 border-slate-700">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-green-500/20 rounded-lg flex items-center justify-center">
            <Server className="w-4 h-4 text-green-400" />
          </div>
          <div className="flex-1">
            <CardTitle className="text-white text-base">Ponte WhatsApp — Por Cliente</CardTitle>
            <CardDescription className="text-slate-400">
              Configure a ponte API de WhatsApp individualmente para cada cliente
            </CardDescription>
          </div>
          <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
            {configuredCount}/{clients.length} configurados
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {clients.length === 0 ? (
          <p className="text-slate-400 text-sm text-center py-4">Nenhum cliente cadastrado.</p>
        ) : (
          clients.map((client) => {
            const isConfigured = !!(client.whatsapp_bridge_url && client.whatsapp_bridge_api_key);
            const isExpanded = expandedId === client.id;

            return (
              <div key={client.id} className="rounded-lg border border-slate-600/50 overflow-hidden">
                <button
                  onClick={() => handleExpand(client)}
                  className="w-full flex items-center gap-3 p-3 bg-slate-700/50 hover:bg-slate-700/80 transition-colors text-left"
                >
                  <div className="w-7 h-7 bg-primary/20 rounded-lg flex items-center justify-center shrink-0">
                    <span className="text-primary text-xs font-bold">{client.name.charAt(0).toUpperCase()}</span>
                  </div>
                  <span className="text-white text-sm font-medium flex-1 truncate">{client.name}</span>
                  <Badge className={isConfigured
                    ? "bg-green-500/20 text-green-400 border-green-500/30 text-xs"
                    : "bg-red-500/20 text-red-400 border-red-500/30 text-xs"
                  }>
                    {isConfigured ? "✓ Ponte Ativa" : "✗ Sem Ponte"}
                  </Badge>
                  {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                </button>

                {isExpanded && (
                  <div className="p-4 space-y-4 bg-slate-800/40">
                    <div className="space-y-2">
                      <Label className="text-slate-300 text-xs flex items-center gap-1.5">
                        <Globe className="w-3.5 h-3.5" /> URL do Endpoint Bridge
                      </Label>
                      <Input
                        value={editUrl}
                        onChange={(e) => setEditUrl(e.target.value)}
                        placeholder="https://xxx.supabase.co/functions/v1/whatsapp-bridge"
                        className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-500"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-slate-300 text-xs flex items-center gap-1.5">
                        <Server className="w-3.5 h-3.5" /> Chave da API (X-Api-Key)
                      </Label>
                      <div className="relative">
                        <Input
                          type={showKey ? "text" : "password"}
                          value={editKey}
                          onChange={(e) => setEditKey(e.target.value)}
                          placeholder="Chave de API do Bridge"
                          className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-500 pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowKey(!showKey)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                        >
                          {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        onClick={() => handleSave(client.id)}
                        disabled={saving}
                        className="bg-green-600 hover:bg-green-700 text-white"
                        size="sm"
                      >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
                        Salvar
                      </Button>
                      {isConfigured && (
                        <Button
                          onClick={() => handleRemove(client.id)}
                          disabled={saving}
                          variant="outline"
                          size="sm"
                          className="border-red-500/50 text-red-400 hover:bg-red-500/10"
                        >
                          Remover Ponte
                        </Button>
                      )}
                    </div>

                    {isConfigured && (
                      <div className="border-t border-slate-600 pt-4 space-y-2">
                        <Label className="text-slate-300 text-xs flex items-center gap-1.5">
                          <Send className="w-3.5 h-3.5" /> Testar envio para este cliente
                        </Label>
                        <div className="flex gap-2">
                          <Input
                            value={testPhone}
                            onChange={(e) => setTestPhone(e.target.value.replace(/[^0-9]/g, ""))}
                            placeholder="5511999999999"
                            className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-500 font-mono max-w-[200px]"
                            maxLength={15}
                          />
                          <Button
                            onClick={() => handleTest(client.id)}
                            disabled={testing || !testPhone}
                            variant="outline"
                            size="sm"
                            className="border-slate-600 text-slate-300 hover:bg-slate-700"
                          >
                            {testing ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Send className="w-4 h-4 mr-1" />}
                            Testar
                          </Button>
                        </div>
                      </div>
                    )}

                    <p className="text-xs text-slate-500">
                      ID: <code className="text-slate-400">{client.id}</code>
                    </p>
                  </div>
                )}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
