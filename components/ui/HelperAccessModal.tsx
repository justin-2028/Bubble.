"use client";

import { useEffect, useMemo, useState } from 'react';
import { HelperTokenCreateResponse, HelperTokenSummary } from '@/lib/cloud';
import { GlassButton } from './GlassButton';

type Props = {
  open: boolean;
  onClose: () => void;
};

export function HelperAccessModal({ open, onClose }: Props) {
  const [tokens, setTokens] = useState<HelperTokenSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [newTokenName, setNewTokenName] = useState('Justin MacBook');
  const [newTokenValue, setNewTokenValue] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    void loadTokens();
  }, [open]);

  const activeTokenCount = useMemo(() => tokens.length, [tokens]);

  if (!open) return null;

  async function loadTokens() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/helper/tokens', { cache: 'no-store' });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setError(payload?.error || 'Could not load helper tokens.');
        return;
      }
      setTokens(Array.isArray(payload?.tokens) ? payload.tokens : []);
    } catch {
      setError('Could not load helper tokens.');
    } finally {
      setLoading(false);
    }
  }

  async function createToken() {
    setCreating(true);
    setError('');
    setNewTokenValue(null);
    try {
      const response = await fetch('/api/helper/tokens', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: newTokenName }),
      });
      const payload = (await response.json().catch(() => null)) as HelperTokenCreateResponse | { error?: string } | null;
      if (!response.ok || !payload || !('token' in payload)) {
        setError((payload as any)?.error || 'Could not create helper token.');
        return;
      }
      setNewTokenValue(payload.token);
      setTokens((prev) => [payload.summary, ...prev]);
    } catch {
      setError('Could not create helper token.');
    } finally {
      setCreating(false);
    }
  }

  async function revokeToken(id: string) {
    setError('');
    try {
      const response = await fetch(`/api/helper/tokens/${id}`, {
        method: 'DELETE',
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setError(payload?.error || 'Could not revoke helper token.');
        return;
      }
      setTokens((prev) => prev.filter((token) => token.id !== id));
      setNewTokenValue(null);
    } catch {
      setError('Could not revoke helper token.');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="glass relative z-10 w-full max-w-2xl rounded-[28px] p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-nav uppercase tracking-[0.18em] text-gray-500">Helper Access</div>
            <div className="mt-2 text-2xl font-display tracking-tight-display text-gray-950">
              Local Mac helper tokens
            </div>
            <p className="mt-2 max-w-xl text-sm leading-6 text-gray-600">
              Generate a token once, paste it into the future Mac helper, and keep all raw iMessage identifiers on your
              machine. Bubble only sees helper-authenticated updates.
            </p>
          </div>
          <GlassButton type="button" onClick={onClose}>
            Close
          </GlassButton>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <section className="rounded-2xl border border-white/60 bg-white/40 p-4">
            <div className="text-sm font-nav tracking-tight-ui text-gray-900">Create Token</div>
            <div className="mt-3 grid gap-3">
              <input
                className="w-full rounded-xl border border-zinc-200/60 bg-white/80 px-3 py-2.5 text-sm"
                value={newTokenName}
                onChange={(event) => setNewTokenName(event.target.value)}
                placeholder="This MacBook"
                maxLength={80}
              />
              <GlassButton type="button" onClick={createToken} disabled={creating}>
                {creating ? 'Creating…' : 'Create New Token'}
              </GlassButton>
              <div className="text-xs leading-5 text-gray-600">
                Active tokens: <span className="font-code">{activeTokenCount}</span>
              </div>
            </div>

            {newTokenValue ? (
              <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4">
                <div className="text-sm font-nav tracking-tight-ui text-emerald-900">Copy This Once</div>
                <div className="mt-2 break-all rounded-xl bg-white/80 px-3 py-2 font-code text-xs text-emerald-950">
                  {newTokenValue}
                </div>
                <div className="mt-2 text-xs leading-5 text-emerald-900/80">
                  Bubble stores only a hash of this token. If you lose it, revoke it and generate another.
                </div>
              </div>
            ) : null}
          </section>

          <section className="rounded-2xl border border-white/60 bg-white/40 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-nav tracking-tight-ui text-gray-900">Issued Tokens</div>
              <GlassButton type="button" className="px-3 py-1.5" onClick={() => void loadTokens()} disabled={loading}>
                Refresh
              </GlassButton>
            </div>

            {error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}

            <div className="mt-3 grid gap-3">
              {tokens.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-zinc-300/70 px-4 py-5 text-sm text-gray-600">
                  No helper tokens created yet.
                </div>
              ) : (
                tokens.map((token) => (
                  <div key={token.id} className="rounded-2xl border border-zinc-200/60 bg-white/65 px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-nav tracking-tight-ui text-gray-900">{token.name}</div>
                        <div className="mt-1 text-xs text-gray-600">
                          Prefix <span className="font-code">{token.prefix}</span>
                        </div>
                        <div className="mt-2 text-xs text-gray-500">
                          Created {formatDate(token.createdAt)}
                          {token.lastUsedAt ? ` • Last used ${formatDate(token.lastUsedAt)}` : ' • Never used'}
                        </div>
                      </div>
                      <GlassButton type="button" intent="destructive" onClick={() => void revokeToken(token.id)}>
                        Revoke
                      </GlassButton>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Unknown';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}
