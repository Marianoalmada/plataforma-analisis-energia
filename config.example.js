// =========================================================================
// Plantilla de configuración de la Plataforma de Análisis de Energía (IE)
// -------------------------------------------------------------------------
// 1. Copiá este archivo como "config.js" (en esta misma carpeta).
// 2. Completá las API keys que uses. Las vacías se ignoran y la app pedirá
//    la key por pantalla (queda en el localStorage de ese navegador).
//
// IMPORTANTE: config.js está en .gitignore — nunca se sube al repositorio.
// Las keys viven únicamente en tu máquina.
// =========================================================================
window.IE_CONFIG = {
    // --- Control de acceso (Supabase): Settings → API Keys en tu proyecto ---
    SUPABASE_URL: "",       // ej: "https://xxxxx.supabase.co"
    SUPABASE_ANON: "",      // publishable key ("sb_publishable_..." o la legacy "eyJ...")

    // Xiaomi MiMo directo (Token Plan): https://www.xiaomimimo.com
    XIAOMI_API_KEY: "",

    // Google AI Studio (Gemini): https://aistudio.google.com/apikey
    GEMINI_API_KEY: "",

    // OpenRouter (una key, cientos de modelos): https://openrouter.ai/keys
    OPENROUTER_API_KEY: "",

    // Endpoint personalizado compatible OpenAI (opcional, si usa Bearer token)
    CUSTOM_API_KEY: ""
};
