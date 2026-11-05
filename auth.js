// =========================================================================
// auth.js — Control de acceso compartido del Portal de Herramientas (IE)
// -------------------------------------------------------------------------
// Cualquier página que incluya este script queda protegida:
//   1. Inyecta la pantalla de acceso (gate) y el indicador de sesión.
//   2. Restaura la sesión de Supabase del navegador (login 1 vez por PC).
//   3. Expone window.IEAuth para la página:
//        IEAuth.isAdmin                     → true sólo para el administrador
//        IEAuth.email                       → email de la sesión activa
//        IEAuth.onLogin(cb)                 → callback al confirmar sesión
//        IEAuth.mountUsersUI(container)     → panel de gestión de usuarios
//                                             (sólo admin; se monta donde se pida)
// Config del servidor de accesos: localStorage (supabase_url/supabase_anon)
// o window.IE_CONFIG.SUPABASE_URL/SUPABASE_ANON (ver config.example.js).
// =========================================================================
(function () {
    'use strict';

    function cfg() {
        const c = window.IE_CONFIG || {};
        return {
            url: localStorage.getItem('supabase_url') || c.SUPABASE_URL || '',
            anon: localStorage.getItem('supabase_anon') || c.SUPABASE_ANON || ''
        };
    }

    // ---------- Inyección de la pantalla de acceso ----------
    const GATE_HTML = `
    <div id="auth-gate" class="hidden fixed inset-0 z-[400] bg-gray-900/95 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <div class="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
            <div class="text-center mb-6">
                <h1 id="auth-title" class="text-2xl font-extrabold text-blue-600">Portal de Herramientas IE</h1>
                <p class="text-gray-500 text-sm mt-1">Inteligencia Energética (IE) · Acceso restringido</p>
            </div>
            <div id="auth-setup" class="hidden space-y-3">
                <p class="text-xs text-gray-500 bg-blue-50 border border-blue-200 rounded-lg p-3">Configuración inicial: datos públicos del proyecto Supabase (Settings → API Keys). Se guardan solo en este navegador.</p>
                <input id="supabase-url" class="auth-input" placeholder="Project URL (https://xxxxx.supabase.co)" autocomplete="off">
                <input id="supabase-anon" class="auth-input" placeholder="Publishable key (sb_publishable_... o eyJ...)" autocomplete="off">
                <button id="btn-save-supabase" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-4 rounded-lg transition-colors">Guardar configuración</button>
                <p id="setup-error" class="text-red-600 text-sm hidden"></p>
            </div>
            <div id="auth-login" class="space-y-3">
                <label for="auth-email" class="block text-sm font-bold text-gray-700">Email</label>
                <input id="auth-email" type="email" class="auth-input" placeholder="tu@email.com" autocomplete="username">
                <label for="auth-password" class="block text-sm font-bold text-gray-700">Contraseña</label>
                <input id="auth-password" type="password" class="auth-input" autocomplete="current-password">
                <button id="btn-login" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-4 rounded-lg shadow-md transition-transform transform hover:scale-[1.02]">Ingresar</button>
                <p id="auth-error" class="text-red-600 text-sm text-center hidden"></p>
                <p class="text-xs text-gray-400 text-center">¿Sin cuenta? Solicitala al administrador (IE).</p>
                <button id="btn-setup-edit" class="w-full text-xs text-gray-400 hover:text-gray-600 underline mt-2">Cambiar servidor de accesos</button>
            </div>
        </div>
    </div>
    <button id="btn-auth-user" class="hidden fixed top-3 right-3 z-[390] bg-white/95 backdrop-blur border border-gray-300 rounded-full px-4 py-1.5 text-xs font-semibold text-gray-700 shadow hover:bg-gray-100 transition-colors" title="Cerrar sesión">
        👤 <span id="auth-user-email"></span> · Salir
    </button>`;

    const GATE_CSS = `
    .auth-input { width: 100%; background: #fff; border: 1px solid #d1d5db; color: #111827; border-radius: 0.5rem;
        padding: 0.6rem 0.8rem; transition: border-color .3s, box-shadow .3s; font-size: .95rem; }
    .auth-input:focus { border-color: #4f46e5; box-shadow: 0 0 0 3px rgba(79,70,229,.2); outline: none; }`;

    const style = document.createElement('style');
    style.textContent = GATE_CSS;
    document.head.appendChild(style);
    document.body.insertAdjacentHTML('beforeend', GATE_HTML);

    const gate = document.getElementById('auth-gate');
    const setupBox = document.getElementById('auth-setup');
    const loginBox = document.getElementById('auth-login');
    const errP = document.getElementById('auth-error');
    const setupErr = document.getElementById('setup-error');
    const btnUser = document.getElementById('btn-auth-user');
    const emailSpan = document.getElementById('auth-user-email');
    let sb = null;

    function showGate(mode) {
        gate.classList.remove('hidden');
        setupBox.classList.toggle('hidden', mode !== 'setup');
        loginBox.classList.toggle('hidden', mode !== 'login');
        errP.classList.add('hidden');
        setupErr.classList.add('hidden');
    }

    const IEAuth = {
        sb: null,
        email: null,
        isAdmin: false,
        sharedAIConfig: null,
        _cbs: [],
        onLogin(cb) { if (typeof cb === 'function') this._cbs.push(cb); },

        async adminFetch(op, payload) {
            return this.callFunction('admin-usuarios', { op, payload: payload || {} });
        },

        async callFunction(fnName, body) {
            const { data } = await sb.auth.getSession();
            const token = data && data.session ? data.session.access_token : '';
            const res = await fetch(cfg().url + '/functions/v1/' + fnName, {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + token, 'apikey': cfg().anon, 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json.error || ('HTTP ' + res.status));
            return json;
        },

        // ---- Panel de gestión de usuarios (montar sólo si el usuario es admin) ----
        mountUsersUI(container) {
            const self = this;
            container.innerHTML = `
                <div class="bg-gray-50 p-4 rounded-xl border border-gray-200 mb-6">
                    <h4 class="font-bold text-gray-700 mb-3">Crear nuevo acceso</h4>
                    <div class="flex flex-col sm:flex-row gap-2">
                        <input type="email" class="auth-input flex-grow" placeholder="Email del usuario (ej: cliente@empresa.com)" autocomplete="off">
                        <input type="text" class="auth-input sm:w-52" placeholder="Contraseña inicial (mín. 6)" autocomplete="off">
                        <button class="btn-auth-create bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-6 rounded-lg shadow-md whitespace-nowrap">Crear acceso</button>
                    </div>
                    <p class="text-xs text-gray-400 mt-2">El usuario queda habilitado de inmediato (sin confirmación por email). Podés cambiar su contraseña cuando quieras desde la tabla.</p>
                </div>
                <div class="overflow-x-auto">
                    <table class="min-w-full divide-y divide-gray-200 text-sm">
                        <thead class="bg-gray-800 text-white">
                            <tr>
                                <th class="px-4 py-3 text-left">Email</th>
                                <th class="px-4 py-3 text-left">Estado</th>
                                <th class="px-4 py-3 text-left">Último ingreso</th>
                                <th class="px-4 py-3 text-left">Creado</th>
                                <th class="px-4 py-3 text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody class="users-tbody divide-y divide-gray-200 bg-white">
                            <tr><td colspan="5" class="px-4 py-8 text-center text-gray-400">Cargando usuarios…</td></tr>
                        </tbody>
                    </table>
                </div>
                <p class="users-msg text-sm mt-3 font-semibold hidden"></p>`;

            const tbody = container.querySelector('.users-tbody');
            const msgEl = container.querySelector('.users-msg');
            const emailIn = container.querySelector('input[type="email"]');
            const passIn = container.querySelector('input[type="text"]');
            const createBtn = container.querySelector('.btn-auth-create');

            function msg(text, isError) {
                msgEl.textContent = text;
                msgEl.className = 'users-msg text-sm mt-3 font-semibold ' + (isError ? 'text-red-600' : 'text-green-700');
                msgEl.classList.remove('hidden');
                setTimeout(() => msgEl.classList.add('hidden'), 6000);
            }
            function fmtFecha(iso) {
                if (!iso) return '—';
                try { return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' }) + ' ' + new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }); }
                catch (e) { return iso; }
            }

            async function loadUsers() {
                tbody.innerHTML = '<tr><td colspan="5" class="px-4 py-8 text-center text-gray-400">Cargando usuarios…</td></tr>';
                try {
                    const { users } = await self.adminFetch('list');
                    const miEmail = (self.email || '').toLowerCase();
                    tbody.innerHTML = '';
                    users.forEach(u => {
                        const esAdmin = u.email.toLowerCase() === miEmail;
                        const tr = document.createElement('tr');
                        tr.className = 'hover:bg-gray-50';
                        const estado = u.bloqueado
                            ? '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700">Bloqueado</span>'
                            : '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-700">Habilitado</span>';
                        const acciones = esAdmin
                            ? '<span class="text-xs text-gray-400 italic">Tu cuenta de administrador</span>'
                            : `<button data-act="toggle" data-id="${u.id}" data-bloq="${u.bloqueado}" class="text-xs font-bold px-3 py-1.5 rounded-lg ${u.bloqueado ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-yellow-500 text-white hover:bg-yellow-600'}">${u.bloqueado ? 'Habilitar' : 'Bloquear'}</button>
                               <button data-act="reset" data-id="${u.id}" data-email="${u.email}" class="text-xs font-bold px-3 py-1.5 rounded-lg bg-gray-200 text-gray-700 hover:bg-gray-300 ml-1">Reset clave</button>
                               <button data-act="delete" data-id="${u.id}" data-email="${u.email}" class="text-xs font-bold px-3 py-1.5 rounded-lg bg-red-100 text-red-700 hover:bg-red-200 ml-1">Eliminar</button>`;
                        tr.innerHTML = `
                            <td class="px-4 py-3 font-semibold text-gray-800">${u.email}${esAdmin ? ' <span class="text-[10px] align-top bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full font-bold">ADMIN</span>' : ''}</td>
                            <td class="px-4 py-3">${estado}</td>
                            <td class="px-4 py-3 text-gray-500 text-xs">${fmtFecha(u.ultimoLogin)}</td>
                            <td class="px-4 py-3 text-gray-500 text-xs">${fmtFecha(u.creado)}</td>
                            <td class="px-4 py-3 text-right whitespace-nowrap">${acciones}</td>`;
                        tbody.appendChild(tr);
                    });
                    if (users.length === 0) tbody.innerHTML = '<tr><td colspan="5" class="px-4 py-8 text-center text-gray-400">Sin usuarios aún.</td></tr>';
                } catch (e) {
                    tbody.innerHTML = '<tr><td colspan="5" class="px-4 py-8 text-center text-red-500">No se pudo cargar: ' + e.message + '</td></tr>';
                }
            }

            tbody.addEventListener('click', async (e) => {
                const btn = e.target.closest('button[data-act]');
                if (!btn) return;
                const { act, id, email, bloq } = btn.dataset;
                try {
                    if (act === 'toggle') {
                        await self.adminFetch(bloq === 'true' ? 'unban' : 'ban', { id });
                        msg(bloq === 'true' ? email + ' habilitado.' : email + ' bloqueado.', false);
                        loadUsers();
                    } else if (act === 'reset') {
                        const pass = prompt('Nueva contraseña para ' + email + ' (mínimo 6 caracteres):', '');
                        if (pass === null) return;
                        if (pass.trim().length < 6) { msg('La contraseña debe tener al menos 6 caracteres.', true); return; }
                        await self.adminFetch('resetPassword', { id, password: pass.trim() });
                        msg('Contraseña de ' + email + ' actualizada.', false);
                    } else if (act === 'delete') {
                        if (btn.dataset.confirm !== 'si') {
                            btn.dataset.confirm = 'si';
                            btn.textContent = '¿Confirmar baja?';
                            btn.classList.add('bg-red-600', 'text-white');
                            setTimeout(() => { btn.dataset.confirm = ''; btn.textContent = 'Eliminar'; btn.classList.remove('bg-red-600', 'text-white'); }, 4000);
                            return;
                        }
                        await self.adminFetch('delete', { id });
                        msg(email + ' eliminado.', false);
                        loadUsers();
                    }
                } catch (err) { msg('Error: ' + err.message, true); }
            });

            createBtn.addEventListener('click', async () => {
                const email = emailIn.value.trim();
                const pass = passIn.value;
                if (!email || !email.includes('@')) { msg('Ingresá un email válido.', true); return; }
                if (pass.length < 6) { msg('La contraseña debe tener al menos 6 caracteres.', true); return; }
                try {
                    await self.adminFetch('create', { email, password: pass });
                    msg('Acceso creado para ' + email + '.', false);
                    emailIn.value = ''; passIn.value = '';
                    loadUsers();
                } catch (err) { msg('Error: ' + err.message, true); }
            });

            loadUsers();
        },

        async _checkAdmin() {
            try {
                const r = await this.adminFetch('whoami');
                this.isAdmin = !!(r && r.admin);
            } catch (e) { this.isAdmin = false; }
            return this.isAdmin;
        }
    };
    window.IEAuth = IEAuth;

    async function showApp(email) {
        gate.classList.add('hidden');
        btnUser.classList.remove('hidden');
        emailSpan.textContent = email;
        IEAuth.email = email;
        // Descargar la configuración IA compartida del servidor (admin la configura
        // en el portal; los usuarios la consumen automáticamente).
        try {
            IEAuth.sharedAIConfig = await IEAuth.callFunction('config-ia', { op: 'get' });
        } catch (e) { IEAuth.sharedAIConfig = null; }
        await IEAuth._checkAdmin();
        IEAuth._cbs.forEach(cb => { try { cb(IEAuth); } catch (e) { } });
    }

    async function initGate() {
        if (!window.supabase) { showGate('setup'); setupErr.textContent = 'No se pudo cargar el módulo de acceso (¿sin internet?). Recargá la página.'; setupErr.classList.remove('hidden'); return; }
        const { url, anon } = cfg();
        if (!url || !anon) { showGate('setup'); return; }
        sb = window.supabase.createClient(url, anon);
        IEAuth.sb = sb;
        const { data } = await sb.auth.getSession();
        if (data && data.session) showApp(data.session.user.email);
        else showGate('login');
        sb.auth.onAuthStateChange((event) => {
            if (event === 'SIGNED_OUT') { btnUser.classList.add('hidden'); IEAuth.email = null; IEAuth.isAdmin = false; showGate('login'); }
        });
    }

    document.getElementById('btn-save-supabase').addEventListener('click', async () => {
        const url = document.getElementById('supabase-url').value.trim();
        const anon = document.getElementById('supabase-anon').value.trim();
        if (!/^https:\/\/.+\.supabase\.co\/?$/.test(url)) { setupErr.textContent = 'La URL no parece válida (formato https://xxxxx.supabase.co).'; setupErr.classList.remove('hidden'); return; }
        if (!anon.startsWith('eyJ') && !anon.startsWith('sb_publishable_')) { setupErr.textContent = 'La clave debe ser la "publishable/anon" (empieza con "eyJ" o "sb_publishable_").'; setupErr.classList.remove('hidden'); return; }
        try {
            window.supabase.createClient(url, anon);
            localStorage.setItem('supabase_url', url);
            localStorage.setItem('supabase_anon', anon);
            location.reload();
        } catch (e) {
            setupErr.textContent = 'Configuración no válida: ' + (e.message || e);
            setupErr.classList.remove('hidden');
        }
    });

    document.getElementById('btn-login').addEventListener('click', async () => {
        const email = document.getElementById('auth-email').value.trim();
        const password = document.getElementById('auth-password').value;
        if (!email || !password) { errP.textContent = 'Completá email y contraseña.'; errP.classList.remove('hidden'); return; }
        errP.classList.add('hidden');
        const btn = document.getElementById('btn-login');
        btn.disabled = true; btn.textContent = 'Verificando…';
        const { error } = await sb.auth.signInWithPassword({ email, password });
        btn.disabled = false; btn.textContent = 'Ingresar';
        if (error) {
            errP.textContent = (error.message === 'Invalid login credentials')
                ? 'Email o contraseña incorrectos, o el usuario no está habilitado por el administrador.'
                : 'Error: ' + error.message;
            errP.classList.remove('hidden');
            return;
        }
        const { data } = await sb.auth.getSession();
        if (data && data.session) showApp(data.session.user.email);
    });

    document.getElementById('auth-password').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') document.getElementById('btn-login').click();
    });

    document.getElementById('btn-setup-edit').addEventListener('click', () => showGate('setup'));

    btnUser.addEventListener('click', async () => {
        if (sb) await sb.auth.signOut();
    });

    initGate();
})();
