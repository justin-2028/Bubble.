import 'server-only';

import { NextRequest } from 'next/server';
import { authenticateHelperToken } from './helperTokens';

type HelperRequestAuthError = {
  ok: false;
  status: 401 | 503;
  error: string;
};

type HelperRequestAuthSuccess = {
  ok: true;
  helper: NonNullable<Awaited<ReturnType<typeof authenticateHelperToken>>>;
};

export async function authenticateHelperRequest(
  request: NextRequest
): Promise<HelperRequestAuthError | HelperRequestAuthSuccess> {
  const authorization = request.headers.get('authorization') || '';
  const bearerMatch = authorization.match(/^Bearer\s+(.+)$/i);
  const token = bearerMatch?.[1]?.trim();

  if (!token) {
    return {
      ok: false,
      status: 401,
      error: 'Missing helper token.',
    };
  }

  let helper;
  try {
    helper = await authenticateHelperToken(token);
  } catch (error) {
    console.error('Helper token authentication failed.', error);
    return {
      ok: false,
      status: 503,
      error: 'Hosted Bubble storage is temporarily unavailable.',
    };
  }

  if (!helper) {
    return {
      ok: false,
      status: 401,
      error: 'Invalid helper token.',
    };
  }

  return {
    ok: true,
    helper,
  };
}
