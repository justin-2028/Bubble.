import { redirect } from 'next/navigation';
import { BubbleApp } from '@/components/BubbleApp';
import { getSession } from '@/lib/server/auth';
import { getAppStateDocument } from '@/lib/server/appState';

export default async function Page() {
  const session = getSession();
  if (!session) {
    redirect('/login');
  }

  try {
    const state = await getAppStateDocument();

    return (
      <BubbleApp
        username={session.username}
        initialSnapshot={{
          version: state.doc.version,
          updatedAt: state.doc.updatedAt,
          state: state.doc.data,
        }}
      />
    );
  } catch (error) {
    console.error('Bubble page failed to load hosted state.', error);
    return (
      <main className="flex min-h-screen items-center justify-center px-6 py-10 text-center">
        <div className="max-w-xl space-y-3">
          <h1 className="text-3xl font-semibold text-gray-950">Bubble Is Temporarily Unavailable</h1>
          <p className="text-base leading-7 text-gray-700">
            Hosted Bubble storage did not respond. Refresh in a moment, and if it persists, check the latest Vercel
            deployment logs for the storage error.
          </p>
        </div>
      </main>
    );
  }
}
