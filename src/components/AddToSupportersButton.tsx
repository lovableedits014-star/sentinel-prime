import { useState } from "react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserPlus, Check, Link2 } from "lucide-react";
import { toast } from "sonner";

type Comment = {
  id: string;
  author_name: string | null;
  author_id: string | null;
  author_profile_picture: string | null;
  platform: string | null;
  client_id: string;
};

type Props = {
  comment: Comment;
  onSuccess?: () => void;
};

export const AddToSupportersButton = ({ comment, onSuccess }: Props) => {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [existingSupporter, setExistingSupporter] = useState<any>(null);
  const [checkingExisting, setCheckingExisting] = useState(false);
  
  const [formData, setFormData] = useState({
    name: comment.author_name || "",
    classification: "neutro",
    notes: "",
  });

  const handleOpen = async () => {
    setIsOpen(true);
    setCheckingExisting(true);
    
    // Check if this profile already exists
    try {
      const { data: profiles } = await supabase
        .from("supporter_profiles")
        .select(`
          *,
          supporter:supporters (*)
        `)
        .eq("platform", comment.platform || "facebook")
        .eq("platform_user_id", comment.author_id || "")
        .limit(1);

      if (profiles && profiles.length > 0) {
        setExistingSupporter(profiles[0].supporter);
      } else {
        setExistingSupporter(null);
      }
    } catch (error) {
      console.error("Error checking existing supporter:", error);
    } finally {
      setCheckingExisting(false);
    }
  };

  const handleAddSupporter = async () => {
    if (!formData.name.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }

    setLoading(true);
    try {
      // Create new supporter
      const { data: supporter, error: supporterError } = await supabase
        .from("supporters")
        .insert({
          client_id: comment.client_id,
          name: formData.name,
          classification: formData.classification as "apoiador_ativo" | "apoiador_passivo" | "neutro" | "critico",
          notes: formData.notes || null,
        } as any)
        .select()
        .single();

      if (supporterError) throw supporterError;

      // Create profile link
      if (comment.author_id) {
        const { error: profileError } = await supabase
          .from("supporter_profiles")
          .insert({
            supporter_id: supporter.id,
            platform: comment.platform || "facebook",
            platform_user_id: comment.author_id,
            platform_username: comment.author_name,
            profile_picture_url: comment.author_profile_picture,
          });

        if (profileError) throw profileError;

        // Link existing engagement_actions to this new supporter
        await supabase
          .from("engagement_actions")
          .update({ supporter_id: supporter.id } as any)
          .eq("client_id", comment.client_id)
          .eq("platform", comment.platform || "facebook")
          .eq("platform_user_id", comment.author_id)
          .is("supporter_id", null);

        // Recalculate score
        await supabase.rpc("calculate_engagement_score", { p_supporter_id: supporter.id });
      }

      toast.success("Apoiador adicionado com sucesso!");
      setIsOpen(false);
      onSuccess?.();
    } catch (error: any) {
      console.error("Error adding supporter:", error);
      toast.error(error.message || "Erro ao adicionar apoiador");
    } finally {
      setLoading(false);
    }
  };

  const handleLinkProfile = async () => {
    if (!existingSupporter || !comment.author_id) return;

    setLoading(true);
    try {
      // Check if this specific profile is already linked
      const { data: existingProfiles } = await supabase
        .from("supporter_profiles")
        .select("id")
        .eq("supporter_id", existingSupporter.id)
        .eq("platform", comment.platform || "facebook")
        .eq("platform_user_id", comment.author_id)
        .limit(1);

      if (existingProfiles && existingProfiles.length > 0) {
        toast.info("Este perfil já está vinculado ao apoiador");
        setIsOpen(false);
        return;
      }

      // Link new profile to existing supporter
      const { error } = await supabase
        .from("supporter_profiles")
        .insert({
          supporter_id: existingSupporter.id,
          platform: comment.platform || "facebook",
          platform_user_id: comment.author_id,
          platform_username: comment.author_name,
          profile_picture_url: comment.author_profile_picture,
        });

      if (error) throw error;

      // Link existing engagement_actions to this supporter
      await supabase
        .from("engagement_actions")
        .update({ supporter_id: existingSupporter.id } as any)
        .eq("client_id", comment.client_id)
        .eq("platform", comment.platform || "facebook")
        .eq("platform_user_id", comment.author_id)
        .is("supporter_id", null);

      // Recalculate score and update last interaction
      await supabase.rpc("calculate_engagement_score", { p_supporter_id: existingSupporter.id });
      await supabase
        .from("supporters")
        .update({ last_interaction_date: new Date().toISOString() })
        .eq("id", existingSupporter.id);

      toast.success("Perfil vinculado ao apoiador existente!");
      setIsOpen(false);
      onSuccess?.();
    } catch (error: any) {
      console.error("Error linking profile:", error);
      toast.error(error.message || "Erro ao vincular perfil");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button size="sm" variant="outline" onClick={handleOpen}>
        <UserPlus className="w-4 h-4 mr-2" />
        Adicionar aos Apoiadores
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar aos Apoiadores</DialogTitle>
            <DialogDescription>
              Vincule este perfil à sua base de apoiadores
            </DialogDescription>
          </DialogHeader>

          {checkingExisting ? (
            <div className="py-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
              <p className="mt-4 text-muted-foreground">Verificando apoiadores existentes...</p>
            </div>
          ) : existingSupporter ? (
            <div className="space-y-4 pt-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-blue-600 mt-0.5" />
                  <div>
                    <p className="font-medium text-blue-800">Apoiador já cadastrado!</p>
                    <p className="text-sm text-blue-700 mt-1">
                      Este perfil pertence a <strong>{existingSupporter.name}</strong>
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <Button 
                  onClick={handleLinkProfile} 
                  disabled={loading}
                  className="flex-1"
                >
                  <Link2 className="w-4 h-4 mr-2" />
                  {loading ? "Vinculando..." : "Vincular Novo Perfil"}
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setExistingSupporter(null);
                  }}
                >
                  Criar Novo
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="supporter-name">Nome</Label>
                <Input
                  id="supporter-name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Nome do apoiador"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="supporter-classification">Classificação</Label>
                <Select
                  value={formData.classification}
                  onValueChange={(value) => setFormData({ ...formData, classification: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="apoiador_ativo">Apoiador Ativo</SelectItem>
                    <SelectItem value="apoiador_passivo">Apoiador Passivo</SelectItem>
                    <SelectItem value="neutro">Neutro</SelectItem>
                    <SelectItem value="critico">Crítico/Oposição</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="supporter-notes">Observações</Label>
                <Textarea
                  id="supporter-notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Anotações sobre o apoiador..."
                />
              </div>

              <div className="bg-muted rounded-lg p-3 text-sm">
                <p className="font-medium mb-1">Perfil a ser vinculado:</p>
                <p className="text-muted-foreground">
                  {comment.platform === "instagram" ? "📸 Instagram" : "📘 Facebook"}: {comment.author_name || comment.author_id || "Desconhecido"}
                </p>
              </div>

              <Button onClick={handleAddSupporter} disabled={loading} className="w-full">
                <UserPlus className="w-4 h-4 mr-2" />
                {loading ? "Adicionando..." : "Adicionar Apoiador"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
