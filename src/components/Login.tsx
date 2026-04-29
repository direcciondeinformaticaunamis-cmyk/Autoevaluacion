import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { BookOpen, Bot, Database, Loader2, Lock, ShieldCheck, Sparkles, User } from 'lucide-react';
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
  const [isSubmitting, setIsSubmitting] = useState(false);

  const normalizedUser = useMemo(() => user.trim().toLowerCase(), [user]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!ALLOWED_USERS.has(normalizedUser)) {
      setError('Usuario no habilitado.');
      return;
    }

    setIsSubmitting(true);
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
      })
      .finally(() => {
        setIsSubmitting(false);
      });
  };

  const featureCards = [
    { label: 'Matriz oficial', description: 'Trazabilidad académica', icon: Database },
    { label: 'Catálogo Drive', description: 'Anexos institucionales', icon: BookOpen },
    { label: 'OCR y sugerencias', description: 'Lectura asistida', icon: Bot },
  ];

  return (
    <div className="min-h-screen w-full bg-[linear-gradient(135deg,#fff7f8_0%,#f8fafc_44%,#fff1f2_100%)] text-slate-900 overflow-hidden">
      <div className="absolute inset-0">
        <motion.div
          aria-hidden
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: [0.18, 0.34, 0.2], scale: [0.95, 1.08, 0.98], x: [0, 24, 0], y: [0, 18, 0] }}
          transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -top-36 -left-32 h-96 w-96 rounded-full bg-rose-600/25 blur-3xl"
        />
        <motion.div
          aria-hidden
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: [0.14, 0.28, 0.16], x: [0, -30, 0], y: [0, 22, 0] }}
          transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut', delay: 0.4 }}
          className="absolute top-16 -right-28 h-[28rem] w-[28rem] rounded-full bg-rose-500/20 blur-3xl"
        />
        <motion.div
          aria-hidden
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: [0.12, 0.24, 0.14], y: [0, -24, 0], scale: [1, 1.06, 1] }}
          transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut', delay: 0.8 }}
          className="absolute bottom-0 left-1/2 h-72 w-[46rem] -translate-x-1/2 rounded-[999px] bg-slate-500/20 blur-3xl"
        />
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(15,23,42,0.09)_1px,transparent_0)] [background-size:18px_18px] opacity-45" />
        <div aria-hidden className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-rose-950 via-rose-700 to-rose-950" />
      </div>

      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl items-center px-6 py-10 max-lg:items-start max-sm:px-4">
        <div className="grid w-full grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-16">
          <motion.section
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, ease: 'easeOut' }}
            className="relative order-2 flex flex-col justify-center lg:order-1"
          >
            <motion.img
              aria-hidden
              src={logoSrc}
              alt=""
              initial={{ opacity: 0, rotate: -6, scale: 0.9 }}
              animate={{ opacity: 0.06, rotate: 0, scale: 1 }}
              transition={{ duration: 0.9, delay: 0.15 }}
              className="pointer-events-none absolute -left-20 -top-20 h-80 w-80 object-contain max-lg:hidden"
            />

            <div className="relative flex items-center gap-5">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.55, delay: 0.1 }}
                className="rounded-[2rem] bg-white/85 p-4 ring-1 ring-white shadow-[0_22px_70px_rgba(15,23,42,0.12)] backdrop-blur-xl"
              >
                <img src={logoSrc} alt="UNAMIS" className="h-24 w-24 object-contain drop-shadow-sm" />
              </motion.div>
              <div>
                <div className="text-xs font-black tracking-[0.45em] text-rose-800 uppercase">UNAMIS</div>
                <div className="mt-1 text-xl font-black tracking-tight text-slate-950">Sistema de Autoevaluación Institucional</div>
                <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-green-100 bg-white/80 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-green-700 shadow-sm">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.8)]" /> Plataforma segura
                </div>
              </div>
            </div>

            <div className="relative mt-9 max-w-xl">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-rose-100 bg-rose-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-rose-800">
                <Sparkles className="h-3 w-3" /> Panel académico
              </div>
              <h1 className="text-5xl font-black tracking-tight text-slate-950 max-md:text-4xl max-sm:text-3xl">Ingreso al panel de evidencias</h1>
              <p className="mt-4 text-base text-slate-600 font-semibold leading-relaxed max-sm:text-sm">
                Acceso restringido al entorno de autoevaluación, trazabilidad de anexos y análisis institucional de evidencias.
              </p>
            </div>

            <div className="relative mt-10 grid max-w-2xl grid-cols-1 gap-3 sm:grid-cols-3">
              {featureCards.map((feature, index) => {
                const Icon = feature.icon;
                return (
                  <motion.div
                    key={feature.label}
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.45, delay: 0.22 + index * 0.08 }}
                    whileHover={{ y: -4 }}
                    className="rounded-2xl border border-white bg-white/75 p-4 shadow-[0_12px_40px_rgba(15,23,42,0.08)] ring-1 ring-slate-200/70 backdrop-blur-xl"
                  >
                    <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-rose-50 text-rose-800 ring-1 ring-rose-100">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-900">{feature.label}</div>
                    <div className="mt-1 text-[11px] font-semibold leading-snug text-slate-500">{feature.description}</div>
                  </motion.div>
                );
              })}
            </div>

            <div className="relative mt-8 flex flex-wrap items-center gap-3 text-[10px] font-black uppercase tracking-widest text-slate-500">
              <span className="flex items-center gap-2 rounded-full border border-white bg-white/70 px-3 py-1.5 shadow-sm">
                <ShieldCheck className="h-3.5 w-3.5 text-rose-800" /> Sesión institucional
              </span>
              <span className="rounded-full border border-white bg-white/70 px-3 py-1.5 shadow-sm">UNAMIS 2026</span>
            </div>
          </motion.section>

          <motion.section
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, delay: 0.12, ease: 'easeOut' }}
            className="order-1 flex items-center justify-center lg:order-2"
          >
            <div className="relative w-full max-w-md overflow-hidden rounded-[2rem] border border-white/90 bg-white/78 shadow-[0_30px_100px_rgba(15,23,42,0.18)] ring-1 ring-slate-200/70 backdrop-blur-2xl">
              <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-rose-950 via-rose-700 to-rose-950" />
              <div aria-hidden className="absolute -right-16 -top-16 h-40 w-40 rounded-full bg-rose-500/10 blur-2xl" />

              <div className="border-b border-slate-100/80 px-7 py-7">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-[10px] font-black tracking-[0.32em] uppercase text-rose-700">Acceso</div>
                    <div className="mt-1 text-lg font-black text-slate-950">Iniciar sesión</div>
                  </div>
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-50 text-rose-800 ring-1 ring-rose-100">
                    <Lock className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-4 text-[11px] font-bold uppercase tracking-widest text-slate-400">
                  Plataforma segura • Sesión institucional • UNAMIS 2026
                </div>
              </div>

              <form onSubmit={submit} className="px-7 py-7 space-y-5">
                <label className="block">
                  <div className="text-[10px] font-black tracking-widest uppercase text-slate-500">Usuario</div>
                  <div className="mt-2 relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      value={user}
                      onChange={(e) => setUser(e.target.value)}
                      placeholder="ej: direccion"
                      autoComplete="username"
                      className={cn(
                        'w-full rounded-2xl border border-white bg-slate-50/90 px-12 py-3.5 text-sm font-semibold outline-none ring-1 ring-slate-200/80 placeholder:text-slate-400 shadow-inner transition-all',
                        'focus:bg-white focus:ring-2 focus:ring-rose-300 focus:border-rose-100'
                      )}
                    />
                  </div>
                </label>

                <label className="block">
                  <div className="text-[10px] font-black tracking-widest uppercase text-slate-500">Contraseña</div>
                  <div className="mt-2 relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      value={pass}
                      onChange={(e) => setPass(e.target.value)}
                      type="password"
                      autoComplete="current-password"
                      className={cn(
                        'w-full rounded-2xl border border-white bg-slate-50/90 px-12 py-3.5 text-sm font-semibold outline-none ring-1 ring-slate-200/80 shadow-inner transition-all',
                        'focus:bg-white focus:ring-2 focus:ring-rose-300 focus:border-rose-100'
                      )}
                    />
                  </div>
                </label>

                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-xs font-semibold text-rose-800 bg-rose-50 ring-1 ring-rose-200 rounded-2xl px-4 py-3"
                  >
                    {error}
                  </motion.div>
                )}

                <motion.button
                  type="submit"
                  disabled={isSubmitting}
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  className="group relative w-full overflow-hidden rounded-2xl bg-gradient-to-r from-rose-900 via-rose-700 to-rose-900 py-3.5 text-[11px] font-black uppercase tracking-widest text-white shadow-[0_18px_45px_rgba(159,18,57,0.28)] transition-all disabled:cursor-wait disabled:opacity-80"
                >
                  <span className="absolute inset-y-0 -left-1/3 w-1/3 skew-x-[-18deg] bg-white/20 transition-transform duration-700 group-hover:translate-x-[26rem]" />
                  <span className="relative flex items-center justify-center gap-2">
                    {isSubmitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Validando...
                      </>
                    ) : (
                      'Ingresar'
                    )}
                  </span>
                </motion.button>

                <div className="rounded-2xl border border-slate-100 bg-white/70 px-4 py-3 text-[10px] text-slate-500 font-semibold leading-relaxed">
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
