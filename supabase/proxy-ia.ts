// Edge Function: proxy-ia
// PROXY SEGURO de IA: el navegador NUNCA ve la API key.
// Flujo: Usuario autenticado → proxy-ia → proveedor IA (Xiaomi/Gemini/OpenRouter)
// La key se lee de la tabla app_config dentro del servidor y se usa para llamar
// al proveedor; al cliente sólo se le devuelve el texto de la respuesta.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Metadatos de proveedores: cómo construir la URL y parsear la respuesta
const PROVIDERS = {
  xiaomi: {
    chatUrl: (baseUrl) => baseUrl + '/chat/completions',
    buildBody: (model, messages) => JSON.stringify({ model, messages }),
    parseResponse: (data) => data.choices?.[0]?.message?.content || '',
    headers: (key) => ({ 'Authorization': 'Bearer ' + key })
  },
  gemini: {
    chatUrl: (baseUrl, model, key) => `${baseUrl}/models/${model}:generateContent?key=${key}`,
    buildBody: (model, messages) => {
      const system = messages.find(m => m.role === 'system');
      const user = messages.filter(m => m.role !== 'system');
      return JSON.stringify({
        contents: user.map(m => ({ parts: [{ text: m.content }] })),
        systemInstruction: system ? { parts: [{ text: system.content }] } : undefined
      });
    },
    parseResponse: (data) => data.candidates?.[0]?.content?.parts?.[0]?.text || '',
    headers: () => ({})
  },
  openrouter: {
    chatUrl: (baseUrl) => baseUrl + '/chat/completions',
    buildBody: (model, messages) => JSON.stringify({ model, messages }),
    parseResponse: (data) => data.choices?.[0]?.message?.content || '',
    headers: (key) => ({ 'Authorization': 'Bearer ' + key, 'X-Title': 'Portal IE' })
  },
  custom: {
    chatUrl: (baseUrl) => baseUrl + '/chat/completions',
    buildBody: (model, messages) => JSON.stringify({ model, messages }),
    parseResponse: (data) => data.choices?.[0]?.message?.content || '',
    headers: (key) => key ? ({ 'Authorization': 'Bearer ' + key }) : ({})
  }
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    // 1. Verificar que el usuario esté autenticado
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

    // 2. Leer la config IA del servidor (la key NUNCA se envía al cliente)
    const { data: cfgRow } = await service.from('app_config').select('data').eq('id', 1).single();
    const cfg = cfgRow?.data ?? {};
    if (!cfg.provider || !cfg.apiKey) {
      return new Response(JSON.stringify({ error: 'sin-configuracion-ia', message: 'El administrador no configuró el motor de IA aún.' }), { status: 400, headers: CORS });
    }

    // 3. Recibir el mensaje del cliente
    const { messages, model: requestModel } = await req.json();
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      throw new Error('messages requerido');
    }
    const model = requestModel || cfg.model;
    if (!model) throw new Error('sin modelo configurado');

    // 4. Construir y enviar la petición al proveedor
    const provider = PROVIDERS[cfg.provider] || PROVIDERS.custom;
    const baseUrl = cfg.provider === 'xiaomi'
      ? 'https://token-plan-sgp.xiaomimimo.com/v1'
      : cfg.provider === 'gemini'
        ? 'https://generativelanguage.googleapis.com/v1beta'
        : cfg.provider === 'openrouter'
          ? 'https://openrouter.ai/api/v1'
          : (cfg.customUrl || '').replace(/\/+$/, '');

    if (!baseUrl) throw new Error('sin URL base del proveedor');

    const url = cfg.provider === 'gemini'
      ? provider.chatUrl(baseUrl, model, cfg.apiKey)
      : provider.chatUrl(baseUrl);

    const aiHeaders = {
      'Content-Type': 'application/json',
      ...provider.headers(cfg.apiKey)
    };

    const aiResponse = await fetch(url, {
      method: 'POST',
      headers: aiHeaders,
      body: provider.buildBody(model, messages)
    });

    const aiData = await aiResponse.json();

    if (!aiResponse.ok) {
      const errMsg = aiData?.error?.message || `Error ${aiResponse.status} del proveedor`;
      return new Response(JSON.stringify({ error: errMsg }), { status: aiResponse.status, headers: CORS });
    }

    // 5. Extraer el texto y devolver SOLO la respuesta (sin key)
    const text = provider.parseResponse(aiData);
    if (!text) throw new Error('respuesta vacía del proveedor');

    return new Response(
      JSON.stringify({ text, model }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } }
    );

  } catch (e) {
    return new Response(
      JSON.stringify({ error: e?.message || String(e) }),
      { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } }
    );
  }
});
