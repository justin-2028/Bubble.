import { redirect } from 'next/navigation';
import { BubbleApp } from '@/components/BubbleApp';
import { getSession } from '@/lib/server/auth';
import { getAppStateDocument } from '@/lib/server/appState';

export default async function Page() {
  const session = getSession();
  if (!session) {
    redirect('/login');
  }

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
}
