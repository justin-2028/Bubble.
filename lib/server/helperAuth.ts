import 'server-only';

import { NextRequest } from 'next/server';
import { authenticateHelperToken } from './helperTokens';

type HelperRequestAuthError = {
  ok: false;
  status: 401;
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

  const helper = await authenticateHelperToken(token);
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
