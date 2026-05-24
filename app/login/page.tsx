import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/auth/LoginForm';
import { LoginWandScene } from '@/components/auth/LoginWandScene';
import { DangerZone } from '@/components/visual/DangerZone';
import { getSession } from '@/lib/server/auth';
import { isAuthConfigured, isSessionConfigured } from '@/lib/server/env';

export default function LoginPage() {
  const session = getSession();
  if (session) {
    redirect('/');
  }

  const authConfigured = isAuthConfigured();
  const sessionConfigured = isSessionConfigured();

  return (
    <main className="relative min-h-screen overflow-hidden white-gradient">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(255,255,255,0.92),transparent_34%),radial-gradient(circle_at_88%_76%,rgba(255,168,151,0.24),transparent_28%),radial-gradient(circle_at_62%_28%,rgba(255,255,255,0.82),transparent_30%)]" />
      <DangerZone />
      <LoginWandScene />

      <div className="relative z-20 mx-auto flex min-h-screen w-full max-w-6xl items-center px-6 py-10">
        <div className="grid w-full items-center gap-8 lg:grid-cols-[1.08fr_0.92fr]">
          <section className="relative min-h-[520px]">
            <div className="login-flow-in glass inline-flex rounded-2xl px-5 py-2">
              <span className="font-display text-4xl leading-none tracking-tight-display text-gray-950 sm:text-6xl">
                Bubble
              </span>
            </div>

            <div className="mt-8 max-w-2xl">
              <h1 className="login-flow-in font-display text-5xl leading-[0.9] tracking-tight-display text-gray-950 sm:text-7xl lg:text-8xl">
                Private garden.
                <br />
                Yours only.
              </h1>
              <p className="login-flow-in mt-6 max-w-xl text-lg leading-8 text-gray-700">
                Bubble is privacy-centric, so this hosted page belongs to one person. If this is not your Bubble,
                make your own instance instead of signing in here.
              </p>
            </div>

            <div className="mt-8 grid max-w-xl gap-3 sm:grid-cols-3">
              {['Make a copy', 'Add your login', 'Connect Mac helper'].map((step, index) => (
                <div
                  key={step}
                  className="login-flow-in glass rounded-2xl px-4 py-3"
                >
                  <div className="font-nav text-xs uppercase tracking-[0.16em] text-gray-500">Step {index + 1}</div>
                  <div className="mt-1 font-nav tracking-tight-ui text-gray-900">{step}</div>
                </div>
              ))}
            </div>
          </section>

          <LoginForm
            authConfigured={authConfigured}
            sessionConfigured={sessionConfigured}
          />
        </div>
      </div>
    </main>
  );
}
