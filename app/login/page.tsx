import { redirect } from 'next/navigation';
import Image from 'next/image';
import type { CSSProperties } from 'react';
import { LoginForm } from '@/components/auth/LoginForm';
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

      <div className="absolute left-[12%] top-[18%] hidden h-24 w-24 rounded-full border border-white/80 bg-white/60 shadow-[0_18px_48px_rgba(0,0,0,0.16)] backdrop-blur-md lg:block" />
      <div className="absolute left-[39%] top-[62%] hidden h-16 w-16 rounded-full border border-white/80 bg-white/55 shadow-[0_16px_38px_rgba(0,0,0,0.14)] backdrop-blur-md lg:block" />
      <div className="absolute right-[24%] top-[18%] hidden h-12 w-12 rounded-full border border-white/80 bg-white/70 shadow-[0_14px_32px_rgba(0,0,0,0.12)] backdrop-blur-md md:block" />

      <Image
        src="/newbubblewand.png"
        alt=""
        width={232}
        height={420}
        priority
        className="pointer-events-none fixed -bottom-32 -right-10 z-10 h-[360px] w-auto drop-shadow-[0_20px_30px_rgba(0,0,0,0.18)] sm:-bottom-36 sm:-right-6 sm:h-[430px] lg:-bottom-40 lg:right-0 lg:h-[520px]"
      />

      <div className="relative z-20 mx-auto flex min-h-screen w-full max-w-6xl items-center px-6 py-10">
        <div className="grid w-full items-center gap-8 lg:grid-cols-[1.08fr_0.92fr]">
          <section className="relative min-h-[520px]">
            <div className="login-flow-in glass inline-flex rounded-2xl px-5 py-2 [--flow-delay:120ms]">
              <span className="font-display text-4xl leading-none tracking-tight-display text-gray-950 sm:text-6xl">
                Bubble
              </span>
            </div>

            <div className="mt-8 max-w-2xl">
              <h1 className="login-flow-in font-display text-5xl leading-[0.9] tracking-tight-display text-gray-950 sm:text-7xl lg:text-8xl [--flow-delay:220ms]">
                Private garden.
                <br />
                Yours only.
              </h1>
              <p className="login-flow-in mt-6 max-w-xl text-lg leading-8 text-gray-700 [--flow-delay:340ms]">
                Bubble is privacy-centric, so this hosted page belongs to one person. If this is not your Bubble,
                make your own instance instead of signing in here.
              </p>
            </div>

            <div className="mt-8 grid max-w-xl gap-3 sm:grid-cols-3">
              {['Make a copy', 'Add your login', 'Connect Mac helper'].map((step, index) => (
                <div
                  key={step}
                  className="login-flow-in glass rounded-2xl px-4 py-3"
                  style={{ '--flow-delay': `${460 + index * 90}ms` } as CSSProperties}
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
