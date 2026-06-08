import { Copy, ExternalLink, Info } from "lucide-react";
import { toast } from "sonner";
import TelemarketingSubNav from "@/components/telemarketing/TelemarketingSubNav";
import { useActiveClientId } from "@/hooks/useActiveClientId";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function TelemarketingAdminConfig() {
  const { clientId } = useActiveClientId();
  const teleUrl = clientId ? `${window.location.origin}/telemarketing/${clientId}` : "";

  return (
    <div className="p-4 md:p-6">
      <TelemarketingSubNav />
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Configurações</h1>
        <p className="text-sm text-muted-foreground">Link público para operadores e regras gerais do módulo.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Link público de atendimento</CardTitle>
          <CardDescription>Compartilhe com os operadores cadastrados. Eles entram com nome + senha.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {teleUrl ? (
            <>
              <div className="bg-muted rounded-md px-3 py-2 flex items-center justify-between gap-2">
                <code className="text-xs text-muted-foreground truncate flex-1">{teleUrl}</code>
                <div className="flex gap-1 shrink-0">
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { navigator.clipboard.writeText(teleUrl); toast.success("Link copiado!"); }}>
                    <Copy className="w-4 h-4" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => window.open(teleUrl, "_blank")}>
                    <ExternalLink className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <div className="flex items-start gap-2 text-xs text-muted-foreground p-3 rounded-md border bg-muted/30">
                <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <p>
                  Para criar/editar operadores e definir senhas, vá em <strong>Operadores</strong>. Operadores inativos não conseguem fazer login mesmo com a senha correta.
                </p>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Selecione um cliente para gerar o link.</p>
          )}
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">Próximas melhorias (roadmap)</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1.5">
          <p>• Histórico imutável de cada tentativa (sem sobrescrever a anterior).</p>
          <p>• Trava de fila para evitar 2 operadores no mesmo contato.</p>
          <p>• Agendamento "ligar de novo às 18h".</p>
          <p>• Campanhas segmentadas (bairro X, líder Y, só indecisos).</p>
          <p>• Script de atendimento configurável por campanha.</p>
          <p>• Rate-limit anti-abuso no login do operador.</p>
        </CardContent>
      </Card>
    </div>
  );
}
