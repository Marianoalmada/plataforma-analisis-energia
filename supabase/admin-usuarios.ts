// Edge Function: admin-usuarios
// Administra los usuarios de acceso a la Plataforma de Análisis Energética (IE).
// Solo acepta órdenes del administrador (ADMIN_EMAIL); el resto recibe 403.
// La service role key NO está en este archivo: Supabase la inyecta como
// variable de entorno del runtime (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')).
//
// Deploy: Supabase Dashboard → Edge Functions → New function → "admin-usuarios"
//         → pegar este código → Deploy (dejar "Verify JWT" activado).
//
// Operaciones (POST JSON { op, payload }):
//   whoami | list | create {email,password} | ban {id} | unban {id}
//   delete {id} | resetPassword {id,password}

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

    // Verificar que el llamador sea el administrador
    const { data: { user }, error: usrErr } = await service.auth.getUser(token);
    if (usrErr || !user || user.email !== ADMIN_EMAIL) {
      return new Response(JSON.stringify({ error: 'no-autorizado' }), { status: 403, headers: CORS });
    }

    const { op, payload = {} } = await req.json();
    let result = null;

    switch (op) {
      case 'whoami':
        result = { admin: true, email: user.email };
        break;

      case 'list': {
        const { data, error } = await service.auth.admin.listUsers({ page: 1, perPage: 200 });
        if (error) throw error;
        result = {
          users: data.users.map(u => ({
            id: u.id,
            email: u.email,
            creado: u.created_at,
            ultimoLogin: u.last_sign_in_at,
            confirmado: u.email_confirmed_at !== null,
            bloqueado: u.banned_until !== null && u.banned_until !== undefined
          }))
        };
        break;
      }

      case 'create': {
        const { email, password } = payload;
        if (!email || !password || password.length < 6) throw new Error('Email y contraseña (mín. 6 caracteres) requeridos.');
        const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
        if (error) throw error;
        result = { ok: true, id: data.user?.id };
        break;
      }

      case 'ban': {
        const { error } = await service.auth.admin.updateUserById(payload.id, { ban_duration: '876000h' });
        if (error) throw error;
        result = { ok: true };
        break;
      }

      case 'unban': {
        const { error } = await service.auth.admin.updateUserById(payload.id, { ban_duration: 'none' });
        if (error) throw error;
        result = { ok: true };
        break;
      }

      case 'delete': {
        const { error } = await service.auth.admin.deleteUser(payload.id);
        if (error) throw error;
        result = { ok: true };
        break;
      }

      case 'resetPassword': {
        if (!payload.password || payload.password.length < 6) throw new Error('Contraseña nueva demasiado corta (mín. 6).');
        const { error } = await service.auth.admin.updateUserById(payload.id, { password: payload.password });
        if (error) throw error;
        result = { ok: true };
        break;
      }

      default:
        throw new Error('operacion-desconocida');
    }

    return new Response(JSON.stringify(result), { headers: { ...CORS, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e?.message || String(e) }),
      { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } }
    );
  }
});
