// Edge Function: config-ia
// Configuración IA compartida del Portal IE (proveedor, keys, modelo).
//   get  → cualquier usuario autenticado (la herramienta la usa por defecto)
//   save → SOLO el administrador
// Almacenamiento: tabla app_config (id=1, data jsonb) con RLS activado y sin
// políticas: nadie toca la tabla con la anon key; todo pasa por esta función
// con la service key (inyectada por el runtime de Supabase).

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

    if (op === 'get') {
      const { data, error } = await service.from('app_config').select('data').eq('id', 1).single();
      if (error && error.code !== 'PGRST116') throw error; // PGRST116 = sin fila aún
      return new Response(JSON.stringify(data?.data ?? {}), { headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    if (op === 'save') {
      if (user.email !== ADMIN_EMAIL) {
        return new Response(JSON.stringify({ error: 'solo-administrador' }), { status: 403, headers: CORS });
      }
      if (!payload || typeof payload !== 'object') throw new Error('payload inválido');
      const { error } = await service.from('app_config').upsert({ id: 1, data: payload });
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    throw new Error('operacion-desconocida');
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e?.message || String(e) }),
      { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } }
    );
  }
});
