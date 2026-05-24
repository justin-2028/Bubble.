"use client";

import { useState } from 'react';
import { GlassButton } from '@/components/ui/GlassButton';

type Props = {
  authConfigured: boolean;
  sessionConfigured: boolean;
};

export function LoginForm({ authConfigured, sessionConfigured }: Props) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const disabled = !authConfigured || !sessionConfigured || submitting;

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (disabled) return;

    setSubmitting(true);
    setError('');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setError(payload?.error || 'Login failed.');
        return;
      }

      window.location.href = '/';
    } catch {
      setError('Login failed. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="login-flow-in glass relative h-fit overflow-hidden rounded-[32px] p-6 lg:p-8">
      <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full border border-white/80 bg-white/50 shadow-[0_16px_38px_rgba(0,0,0,0.12)]" />
      <div className="pointer-events-none absolute -bottom-12 left-10 h-20 w-20 rounded-full border border-white/80 bg-white/40 shadow-[0_14px_34px_rgba(0,0,0,0.1)]" />

      <div className="relative">
        <div className="font-nav text-xs uppercase tracking-[0.18em] text-gray-500">Owner Entrance</div>
        <h2 className="mt-4 font-display text-4xl leading-none tracking-tight-display text-gray-950">
          Sign in
        </h2>
        <p className="mt-3 text-sm leading-6 text-gray-700">
          Only the owner of this Bubble can enter. Everyone else should make a separate Bubble instance.
        </p>
      </div>

      {!authConfigured && (
        <div className="relative mt-6 rounded-2xl border border-orange-200 bg-orange-50/80 px-4 py-3 text-sm text-orange-800">
          Set <code>BUBBLE_ADMIN_PASSWORD_HASH</code> before signing in.
        </div>
      )}

      {authConfigured && !sessionConfigured && (
        <div className="relative mt-6 rounded-2xl border border-orange-200 bg-orange-50/80 px-4 py-3 text-sm text-orange-800">
          Set <code>BUBBLE_SESSION_SECRET</code> or <code>NEXTAUTH_SECRET</code> before signing in.
        </div>
      )}

      <form className="relative mt-6 grid gap-4" onSubmit={onSubmit} autoComplete="off">
        <label className="grid gap-1.5 text-sm font-body text-gray-800">
          <span className="font-nav tracking-tight-ui">Username</span>
          <input
            className="w-full rounded-2xl border border-white/70 bg-white/70 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.75),0_10px_24px_rgba(0,0,0,0.06)] outline-none transition focus:border-sky-200 focus:ring-4 focus:ring-sky-200/45"
            name="bubble-owner-name"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            disabled={disabled}
            required
          />
        </label>

        <label className="grid gap-1.5 text-sm font-body text-gray-800">
          <span className="font-nav tracking-tight-ui">Password</span>
          <input
            type="password"
            className="w-full rounded-2xl border border-white/70 bg-white/70 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.75),0_10px_24px_rgba(0,0,0,0.06)] outline-none transition focus:border-sky-200 focus:ring-4 focus:ring-sky-200/45"
            name="bubble-owner-secret"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="off"
            disabled={disabled}
            required
          />
        </label>

        {error ? <div className="text-sm text-red-600">{error}</div> : null}

        <GlassButton type="submit" className="mt-2 justify-center rounded-2xl py-3 text-base" disabled={disabled}>
          {submitting ? 'Signing In…' : 'Sign In'}
        </GlassButton>
      </form>
    </section>
  );
}
