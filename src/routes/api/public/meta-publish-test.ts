import { createFileRoute } from "@tanstack/react-router"
import { supabase } from "@/integrations/supabase/client-selfhosted"

export const Route = createFileRoute("/api/public/meta-publish-test")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // Apenas um endpoint de diagnóstico rápido para ver se a tabela existe e está acessível
        const { data, error } = await supabase
          .from('meta_scheduled_posts')
          .select('id')
          .limit(1);
          
        return Response.json({ 
            table_exists: !error,
            error: error?.message,
            timestamp: new Date().toISOString()
        });
      },
    },
  },
})
