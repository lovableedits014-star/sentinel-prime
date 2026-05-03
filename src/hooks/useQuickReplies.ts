import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_QUICK_REPLIES } from "@/lib/quick-replies";
import { toast } from "sonner";

export function useQuickReplies(clientId: string | undefined) {
  const [replies, setReplies] = useState<string[]>(DEFAULT_QUICK_REPLIES);
  const [isGenerating, setIsGenerating] = useState(false);

  const regenerate = useCallback(async () => {
    if (!clientId) {
      toast.error("Cliente não identificado");
      return;
    }
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-quick-replies", {
        body: { clientId, currentReplies: replies },
      });
      if (error) throw error;
      if (data?.success && Array.isArray(data.replies) && data.replies.length === 12) {
        setReplies(data.replies);
        toast.success("Novas respostas geradas!");
      } else {
        throw new Error(data?.error || "Resposta inválida da IA");
      }
    } catch (e: any) {
      console.error("regenerate quick replies failed:", e);
      toast.error(e?.message || "Falha ao gerar novas respostas");
    } finally {
      setIsGenerating(false);
    }
  }, [clientId, replies]);

  return { replies, isGenerating, regenerate };
}