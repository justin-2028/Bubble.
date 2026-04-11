import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/auth/LoginForm';
import { getSession } from '@/lib/server/auth';
import { getAdminUsername, isAuthConfigured, isSessionConfigured } from '@/lib/server/env';

export default function LoginPage() {
  const session = getSession();
  if (session) {
    redirect('/');
  }

  const authConfigured = isAuthConfigured();
  const sessionConfigured = isSessionConfigured();

  return (
    <main className="relative min-h-screen overflow-hidden white-gradient">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.75),transparent_45%),radial-gradient(circle_at_bottom_right,rgba(229,229,229,0.65),transparent_42%)]" />
      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl items-center justify-center px-6 py-10">
        <div className="grid w-full max-w-5xl gap-8 lg:grid-cols-[1.15fr_0.85fr]">
          <section className="glass rounded-[32px] p-8 lg:p-10">
            <div className="text-sm font-nav uppercase tracking-[0.18em] text-gray-500">Bubble Garden</div>
            <h1 className="mt-5 max-w-xl font-display text-4xl tracking-tight-display text-gray-950 lg:text-6xl">
              Hosted Bubble, private by design.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-gray-700 lg:text-lg">
              Your Bubble data lives behind login, while the future Mac helper will keep iMessage identifiers and
              message-derived metadata local to your machine.
            </p>
            <div className="mt-8 grid gap-3 text-sm text-gray-700 lg:max-w-xl">
              <div className="glass rounded-2xl px-4 py-3">
                Browser data stays limited to the Bubble fields you actually want everywhere.
              </div>
              <div className="glass rounded-2xl px-4 py-3">
                Helper tokens are generated from inside Bubble and can be revoked at any time.
              </div>
              <div className="glass rounded-2xl px-4 py-3">
                Fonts are now self-hosted through Next.js instead of fetched from Google at runtime.
              </div>
            </div>
          </section>

          <LoginForm
            defaultUsername={getAdminUsername()}
            authConfigured={authConfigured}
            sessionConfigured={sessionConfigured}
          />
        </div>
      </div>
    </main>
  );
}
