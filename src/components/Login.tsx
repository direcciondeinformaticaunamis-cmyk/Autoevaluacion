import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Lock, User } from 'lucide-react';
import { cn } from '../lib/utils';

const ALLOWED_USERS = new Set([
  'direccion',
  'secretaria',
  'coordinacion_academica',
  'soporte_tecnologico',
  'coordinador_ead',
  'administrativo_ead',
  'director_informatica',
]);

const TEMP_PASSWORD = 'Unamis2026*';

export default function Login({
  logoSrc,
  onAuthed,
}: {
  logoSrc: string;
  onAuthed: (user: string) => void;
}) {
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [error, setError] = useState<string>('');

  const normalizedUser = useMemo(() => user.trim().toLowerCase(), [user]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!ALLOWED_USERS.has(normalizedUser)) {
      setError('Usuario no habilitado.');
      return;
    }
    // Server validates and sets an HttpOnly session cookie.
    fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ user: normalizedUser, pass }),
    })
      .then(async (r) => {
        if (!r.ok) {
          if (r.status === 401) throw new Error('Contraseña incorrecta.');
          if (r.status === 403) throw new Error('Usuario no habilitado.');
          throw new Error('No se pudo iniciar sesión.');
        }
        return r.json();
      })
      .then((data) => {
        if (!data?.ok) throw new Error('No se pudo iniciar sesión.');
        onAuthed(normalizedUser);
      })
      .catch((err) => {
        setError(String(err?.message || err));
      });
  };

  return (
    <div className="min-h-screen w-full bg-slate-50 text-slate-900 overflow-hidden">
      <div className="absolute inset-0">
        <motion.div
          aria-hidden
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6 }}
          className="absolute -top-28 -left-28 h-80 w-80 rounded-full bg-rose-600/25 blur-3xl"
        />
        <motion.div
          aria-hidden
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, delay: 0.1 }}
          className="absolute top-24 -right-28 h-96 w-96 rounded-full bg-rose-500/20 blur-3xl"
        />
        <motion.div
          aria-hidden
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.15 }}
          className="absolute bottom-0 left-1/2 h-72 w-[42rem] -translate-x-1/2 rounded-[999px] bg-slate-400/20 blur-3xl"
        />
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(15,23,42,0.08)_1px,transparent_0)] [background-size:18px_18px] opacity-60" />
      </div>

      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl items-center px-6 py-10">
        <div className="grid w-full grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-16">
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex flex-col justify-center"
          >
            <div className="flex items-center gap-4">
              <div className="rounded-2xl bg-white p-2.5 ring-1 ring-slate-200 shadow-sm">
                <img src={logoSrc} alt="UNAMIS" className="h-24 w-24 object-contain" />
              </div>
              <div>
                <div className="text-xs font-black tracking-[0.32em] text-rose-700 uppercase">UNAMIS</div>
                <div className="text-lg font-black tracking-tight text-slate-900">Plataforma de Autoevaluación</div>
              </div>
            </div>

            <div className="mt-8 max-w-xl">
              <h1 className="text-3xl font-black tracking-tight">Ingreso al panel de evidencias</h1>
              <p className="mt-3 text-sm text-slate-600 font-medium leading-relaxed">
                Acceso restringido por usuario. Ingresá con tu credencial institucional.
              </p>
            </div>

            <div className="mt-10 flex flex-wrap gap-2 text-[10px] font-black tracking-widest uppercase text-slate-500">
              <span className="rounded-full bg-white ring-1 ring-slate-200 px-3 py-1 shadow-sm">Matriz oficial</span>
              <span className="rounded-full bg-white ring-1 ring-slate-200 px-3 py-1 shadow-sm">Catálogo Drive</span>
              <span className="rounded-full bg-white ring-1 ring-slate-200 px-3 py-1 shadow-sm">OCR y sugerencias</span>
            </div>
          </motion.section>

          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.05 }}
            className="flex items-center justify-center"
          >
            <div className="w-full max-w-md rounded-3xl bg-white ring-1 ring-slate-200 shadow-[0_20px_80px_rgba(15,23,42,0.12)] overflow-hidden">
              <div className="px-7 py-6 border-b border-slate-100">
                <div className="text-[10px] font-black tracking-[0.28em] uppercase text-rose-700">Acceso</div>
                <div className="mt-1 text-sm font-black text-slate-900">Iniciar sesión</div>
              </div>

              <form onSubmit={submit} className="px-7 py-6 space-y-4">
                <label className="block">
                  <div className="text-[10px] font-black tracking-widest uppercase text-slate-500">Usuario</div>
                  <div className="mt-2 relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      value={user}
                      onChange={(e) => setUser(e.target.value)}
                      placeholder="ej: direccion"
                      autoComplete="username"
                      className={cn(
                        'w-full rounded-2xl bg-slate-50 ring-1 ring-slate-200 px-10 py-3 text-sm outline-none placeholder:text-slate-400',
                        'focus:ring-2 focus:ring-rose-300'
                      )}
                    />
                  </div>
                </label>

                <label className="block">
                  <div className="text-[10px] font-black tracking-widest uppercase text-slate-500">Contraseña</div>
                  <div className="mt-2 relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      value={pass}
                      onChange={(e) => setPass(e.target.value)}
                      type="password"
                      autoComplete="current-password"
                      className={cn(
                        'w-full rounded-2xl bg-slate-50 ring-1 ring-slate-200 px-10 py-3 text-sm outline-none',
                        'focus:ring-2 focus:ring-rose-300'
                      )}
                    />
                  </div>
                </label>

                {error && (
                  <div className="text-xs font-semibold text-rose-800 bg-rose-50 ring-1 ring-rose-200 rounded-2xl px-4 py-3">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full rounded-2xl bg-rose-700 hover:bg-rose-600 active:bg-rose-700 transition-colors text-white font-black uppercase tracking-widest text-[11px] py-3 shadow-[0_10px_30px_rgba(244,63,94,0.22)]"
                >
                  Ingresar
                </button>

                <div className="text-[10px] text-slate-500 font-semibold leading-relaxed">
                  Tip: el usuario es sin espacios, en minúsculas.
                </div>
              </form>
            </div>
          </motion.section>
        </div>
      </div>
    </div>
  );
}
