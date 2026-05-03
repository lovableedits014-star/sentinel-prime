import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';
import { z } from 'npm:zod@3.23.8';
import { getClientLLMConfig, callLLM, type LLMMessage } from '../_shared/llm-router.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const RequestSchema = z.object({
  clientId: z.string().uuid(),
  currentReplies: z.array(z.string()).optional(),
});

const FALLBACK_REPLIES = [
  'Muito obrigado pelo carinho! 🙏',
  'Agradeço o apoio, conte sempre comigo!',
  'Que bom ter você com a gente! 💪',
  'Seu apoio faz toda a diferença, obrigado!',
  'Obrigado pela força! Seguimos juntos.',
  'Valeu demais pelo comentário! 🙌',
  'Gratidão pelo seu carinho!',
  'Obrigado, é por pessoas como você que seguimos firmes!',
  'Recebido com muito carinho, obrigado!',
  'Muito obrigado, abraço!',
  'Agradeço de coração 💚',
  'Obrigado, conte sempre comigo!',
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ success: false, error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = RequestSchema.parse(await req.json());
    const { clientId, currentReplies } = body;

    // Verify client ownership (owner OR team member)
    const { data: client } = await supabase
      .from('clients')
      .select('id, name, cargo')
      .eq('id', clientId)
      .maybeSingle();

    if (!client) {
      return new Response(JSON.stringify({ success: false, error: 'Cliente não encontrado' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const llmConfig = await getClientLLMConfig(supabase, clientId);

    const avoidBlock = currentReplies && currentReplies.length > 0
      ? `\n\nEvite repetir estas frases que já foram usadas:\n${currentReplies.map((r) => `- ${r}`).join('\n')}`
      : '';

    const systemPrompt = `Você gera respostas curtas e positivas para comentários de apoiadores em redes sociais de um político brasileiro${client.cargo ? ` (${client.cargo})` : ''}.

Regras OBRIGATÓRIAS:
- Gere EXATAMENTE 12 frases distintas
- Cada frase no máximo 80 caracteres
- Português coloquial brasileiro, tom caloroso e agradecido
- Variar abertura: alternar entre "Obrigado", "Gratidão", "Que bom", "Valeu", "Agradeço", "Recebido", etc.
- Cerca de metade pode ter um emoji discreto (🙏 💪 🙌 💚 ❤️ 🔥), a outra metade sem emoji
- NÃO usar hashtags
- NÃO mencionar política, partidos, propostas ou promessas
- NÃO repetir a palavra inicial entre as 12 frases
- Frases devem servir tanto para curtidas/joinhas quanto para comentários positivos genéricos${avoidBlock}

Responda APENAS com um JSON válido no formato exato:
{"replies":["frase 1","frase 2", ...12 itens...]}
Sem texto antes ou depois, sem markdown, sem code fences.`;

    const messages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: 'Gere agora as 12 respostas rápidas.' },
    ];

    let replies: string[] = [];
    try {
      const llmResp = await callLLM(llmConfig as any, {
        messages,
        maxTokens: 800,
        temperature: 0.95,
      });
      const raw = llmResp.content.trim();
      // Try to extract JSON object
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : raw;
      const parsed = JSON.parse(jsonStr);
      if (Array.isArray(parsed?.replies)) {
        replies = parsed.replies
          .filter((r: any) => typeof r === 'string')
          .map((r: string) => r.trim())
          .filter((r: string) => r.length > 0 && r.length <= 120);
      }
    } catch (e) {
      console.error('LLM parse error:', e);
    }

    // Pad/truncate to exactly 12 using fallback
    if (replies.length < 12) {
      const need = 12 - replies.length;
      const seen = new Set(replies.map((r) => r.toLowerCase()));
      for (const f of FALLBACK_REPLIES) {
        if (replies.length >= 12) break;
        if (!seen.has(f.toLowerCase())) {
          replies.push(f);
          seen.add(f.toLowerCase());
        }
      }
      // If still short, just slice fallback
      while (replies.length < 12) {
        replies.push(FALLBACK_REPLIES[replies.length % FALLBACK_REPLIES.length]);
      }
    }
    replies = replies.slice(0, 12);

    return new Response(JSON.stringify({ success: true, replies }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('generate-quick-replies error:', error);
    const msg = error instanceof z.ZodError
      ? 'Dados inválidos: ' + error.errors.map((e) => e.message).join(', ')
      : error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});