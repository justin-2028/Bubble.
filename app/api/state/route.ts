import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/server/auth';
import { getAppStateDocument, replaceAppState } from '@/lib/server/appState';
import { normalizeExportSchema } from '@/lib/exportSchema';

const putStateSchema = z.object({
  baseVersion: z.number().int().min(1),
  state: z.unknown(),
});

export async function GET(request: NextRequest) {
  try {
    if (!getSession()) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const current = await getAppStateDocument();
    const requestedVersion = Number(request.nextUrl.searchParams.get('version') || '');
    if (Number.isFinite(requestedVersion) && requestedVersion === current.doc.version) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          'Cache-Control': 'no-store',
        },
      });
    }

    return NextResponse.json(
      {
        version: current.doc.version,
        updatedAt: current.doc.updatedAt,
        state: current.doc.data,
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error) {
    console.error('Bubble state GET failed.', error);
    return NextResponse.json({ error: 'Hosted Bubble storage is temporarily unavailable.' }, { status: 503 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    if (!getSession()) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const parsed = putStateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid state payload.' }, { status: 400 });
    }

    const result = await replaceAppState(
      normalizeExportSchema(parsed.data.state),
      parsed.data.baseVersion
    );

    if (!result.ok) {
      return NextResponse.json(
        {
          reason: result.reason,
          version: result.current.version,
          updatedAt: result.current.updatedAt,
          state: result.current.data,
        },
        {
          status: 409,
          headers: {
            'Cache-Control': 'no-store',
          },
        }
      );
    }

    return NextResponse.json(
      {
        version: result.doc.version,
        updatedAt: result.doc.updatedAt,
        state: result.doc.data,
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error) {
    console.error('Bubble state PUT failed.', error);
    return NextResponse.json({ error: 'Hosted Bubble storage is temporarily unavailable.' }, { status: 503 });
  }
}
