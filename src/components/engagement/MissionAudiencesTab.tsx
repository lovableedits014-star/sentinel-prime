import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { ListChecks, Loader2, Pencil, Plus, Star, Trash2 } from "lucide-react";
import {
  AUDIENCE_GROUP_LABEL, type AudienceGroup, type MissionAudience,
  deleteAudience, fetchAudiences,
} from "@/lib/mission-audiences";
import MissionAudienceDialog from "./MissionAudienceDialog";

export default function MissionAudiencesTab({ clientId }: { clientId: string }) {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<MissionAudience | null>(null);
  const [toDelete, setToDelete] = useState<MissionAudience | null>(null);

  const { data: audiences = [], isLoading } = useQuery<MissionAudience[]>({
    queryKey: ["mission-audiences", clientId],
    queryFn: () => fetchAudiences(clientId),
    enabled: !!clientId,
  });

  const confirmDelete = async () => {
    if (!toDelete) return;
    try {
      await deleteAudience(toDelete.id);
      await qc.invalidateQueries({ queryKey: ["mission-audiences", clientId] });
      toast.success("Lista removida");
    } catch (e: any) {
      toast.error(e?.message || "Falha ao remover a lista");
    } finally {
      setToDelete(null);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <ListChecks className="h-4 w-4" /> Listas de obrigados
              </CardTitle>
              <CardDescription>
                Monte listas reutilizáveis por grupo (coordenadores, líderes, contratados com contrato vigente,
                voluntários). Quem entra depois no grupo já é puxado automaticamente. Quem não está na lista fica
                de fora das cobranças e aparece na aba de não obrigados.
              </CardDescription>
            </div>
            <Button
              className="gap-1.5"
              onClick={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4" /> Nova lista
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-10 text-center">
              <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : audiences.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhuma lista criada. Crie a primeira — por exemplo “Contratados + voluntários”.
            </p>
          ) : (
            <div className="space-y-2">
              {audiences.map((a) => (
                <div key={a.id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border p-3">
                  <div className="min-w-0 space-y-1.5">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      {a.nome}
                      {a.is_default && (
                        <Badge className="gap-1 bg-amber-500 text-[10px] hover:bg-amber-500">
                          <Star className="h-3 w-3" /> Padrão
                        </Badge>
                      )}
                    </p>
                    {a.descricao && <p className="text-xs text-muted-foreground">{a.descricao}</p>}
                    <div className="flex flex-wrap gap-1">
                      {a.regra.grupos.length === 0 ? (
                        <span className="text-xs text-muted-foreground">Somente pessoas incluídas à mão</span>
                      ) : (
                        a.regra.grupos.map((g) => (
                          <Badge key={g} variant="secondary" className="text-[10px]">
                            {AUDIENCE_GROUP_LABEL[g as AudienceGroup] || g}
                          </Badge>
                        ))
                      )}
                      {a.regra.regioes.length > 0 && (
                        <Badge variant="outline" className="text-[10px]">
                          {a.regra.regioes.length} região(ões)
                        </Badge>
                      )}
                      {a.regra.indicadores.length > 0 && (
                        <Badge variant="outline" className="text-[10px]">
                          {a.regra.indicadores.length} indicador(es)
                        </Badge>
                      )}
                      {a.regra.escopos.length > 0 && (
                        <Badge variant="outline" className="text-[10px]">{a.regra.escopos.join(", ")}</Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1 px-2 text-xs"
                      onClick={() => {
                        setEditing(a);
                        setDialogOpen(true);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" /> Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 gap-1 px-2 text-xs text-destructive"
                      onClick={() => setToDelete(a)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <MissionAudienceDialog
        clientId={clientId}
        audience={editing}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />

      <AlertDialog open={!!toDelete} onOpenChange={(v) => !v && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover “{toDelete?.nome}”?</AlertDialogTitle>
            <AlertDialogDescription>
              As missões que usam esta lista voltam a medir o público padrão (contratos + voluntários).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
