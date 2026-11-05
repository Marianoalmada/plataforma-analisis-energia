// Edge Function: log-ia
// Registra cada uso de IA por usuario (quién, cuándo, qué modelo, qué herramienta).
//   log    → cualquier usuario autenticado (lo llama la herramienta tras generar)
//   list   → SÓLO el administrador (lo ve en el portal)
// Tabla: ia_usage (id, user_email, model, tool, prompt_tokens, response_tokens, created_at)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ADMIN_EMAIL = Deno.env.get('ADMIN_EMAIL') ?? 'marianoalmada@gmail.com';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const token = (req.headers.get('Authorization') || '').replace('Bearer ', '');
    const service = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: { user }, error: usrErr } = await service.auth.getUser(token);
    if (usrErr || !user) {
      return new Response(JSON.stringify({ error: 'no-autorizado' }), { status: 403, headers: CORS });
    }

    const { op, payload = {} } = await req.json();

    if (op === 'log') {
      const { model, tool, promptTokens, responseTokens } = payload;
      const { error } = await service.from('ia_usage').insert({
        user_email: user.email,
        model: model || 'desconocido',
        tool: tool || 'desconocido',
        prompt_tokens: promptTokens || 0,
        response_tokens: responseTokens || 0
      });
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    if (op === 'list') {
      if (user.email !== ADMIN_EMAIL) {
        return new Response(JSON.stringify({ error: 'solo-administrador' }), { status: 403, headers: CORS });
      }
      const { data, error } = await service.from('ia_usage')
        .select('id, user_email, model, tool, prompt_tokens, response_tokens, created_at')
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return new Response(JSON.stringify({ logs: data || [] }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    throw new Error('operacion-desconocida');
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e?.message || String(e) }),
      { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } }
    );
  }
});
