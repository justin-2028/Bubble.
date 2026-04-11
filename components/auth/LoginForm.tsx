"use client";

import { useState } from 'react';
import { GlassButton } from '@/components/ui/GlassButton';

type Props = {
  defaultUsername: string;
  authConfigured: boolean;
  sessionConfigured: boolean;
};

export function LoginForm({ defaultUsername, authConfigured, sessionConfigured }: Props) {
  const [username, setUsername] = useState(defaultUsername);
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
    <section className="glass h-fit rounded-[32px] p-8 lg:p-10">
      <div className="text-sm font-nav uppercase tracking-[0.18em] text-gray-500">Private Access</div>
      <h2 className="mt-4 font-display text-3xl tracking-tight-display text-gray-950">Sign In</h2>
      <p className="mt-3 text-sm leading-6 text-gray-600">
        This Bubble instance is private. Authenticate before the app syncs or exposes any hosted state.
      </p>

      {!authConfigured && (
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Set <code>BUBBLE_ADMIN_PASSWORD_HASH</code> before signing in.
        </div>
      )}

      {authConfigured && !sessionConfigured && (
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Set <code>BUBBLE_SESSION_SECRET</code> or <code>NEXTAUTH_SECRET</code> before signing in.
        </div>
      )}

      <form className="mt-6 grid gap-4" onSubmit={onSubmit}>
        <label className="grid gap-1.5 text-sm font-body text-gray-800">
          <span className="font-nav tracking-tight-ui">Username</span>
          <input
            className="w-full rounded-xl border border-zinc-200/60 bg-white/70 px-3 py-2.5"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            disabled={disabled}
            required
          />
        </label>

        <label className="grid gap-1.5 text-sm font-body text-gray-800">
          <span className="font-nav tracking-tight-ui">Password</span>
          <input
            type="password"
            className="w-full rounded-xl border border-zinc-200/60 bg-white/70 px-3 py-2.5"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            disabled={disabled}
            required
          />
        </label>

        {error ? <div className="text-sm text-red-600">{error}</div> : null}

        <GlassButton type="submit" className="mt-2 justify-center py-3 text-base" disabled={disabled}>
          {submitting ? 'Signing In…' : 'Sign In'}
        </GlassButton>
      </form>
    </section>
  );
}
