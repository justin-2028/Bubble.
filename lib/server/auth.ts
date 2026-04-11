import 'server-only';

import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { cookies } from 'next/headers';
import {
  SESSION_COOKIE_NAME,
  getAdminPassword,
  getAdminPasswordHash,
  getAdminUsername,
  getSessionSecret,
} from './env';

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const scryptAsync = promisify(crypto.scrypt);

type SessionPayload = {
  v: 1;
  sub: 'admin';
  username: string;
  iat: number;
  exp: number;
};

export type AuthSession = Pick<SessionPayload, 'username' | 'exp'>;

export async function verifyAdminCredentials(username: string, password: string) {
  if (username !== getAdminUsername()) return false;

  const storedHash = getAdminPasswordHash();
  if (storedHash) {
    return verifyScryptHash(password, storedHash);
  }

  const storedPassword = getAdminPassword();
  if (!storedPassword) return false;
  return timingSafeEqualString(password, storedPassword);
}

export function getSession(): AuthSession | null {
  const secret = getSessionSecret();
  if (!secret) return null;
  const raw = cookies().get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return null;
  const payload = decodeSession(raw, secret);
  if (!payload) return null;
  return { username: payload.username, exp: payload.exp };
}

export function issueSessionCookie(username: string) {
  const secret = getSessionSecret();
  if (!secret) throw new Error('BUBBLE_SESSION_SECRET or NEXTAUTH_SECRET must be configured');
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    v: 1,
    sub: 'admin',
    username,
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
  };
  cookies().set({
    name: SESSION_COOKIE_NAME,
    value: encodeSession(payload, secret),
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearSessionCookie() {
  cookies().set({
    name: SESSION_COOKIE_NAME,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

function encodeSession(payload: SessionPayload, secret: string) {
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

function decodeSession(value: string, secret: string) {
  const [encodedPayload, signature] = value.split('.');
  if (!encodedPayload || !signature) return null;
  const expectedSignature = sign(encodedPayload, secret);
  if (!timingSafeEqualString(signature, expectedSignature)) return null;

  try {
    const parsed = JSON.parse(base64UrlDecode(encodedPayload));
    if (!parsed || parsed.v !== 1 || parsed.sub !== 'admin') return null;
    if (typeof parsed.exp !== 'number' || parsed.exp <= Math.floor(Date.now() / 1000)) return null;
    if (typeof parsed.username !== 'string' || parsed.username.length === 0) return null;
    return parsed as SessionPayload;
  } catch {
    return null;
  }
}

function sign(value: string, secret: string) {
  return base64UrlEncode(crypto.createHmac('sha256', secret).update(value).digest());
}

function base64UrlEncode(input: string | Buffer) {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buffer.toString('base64url');
}

function base64UrlDecode(input: string) {
  return Buffer.from(input, 'base64url').toString('utf8');
}

function timingSafeEqualString(a: string, b: string) {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  if (aBuffer.length !== bBuffer.length) return false;
  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

async function verifyScryptHash(password: string, encodedHash: string) {
  const [scheme, saltB64, hashB64] = encodedHash.split('$');
  if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false;
  const salt = Buffer.from(saltB64, 'base64url');
  const storedHash = Buffer.from(hashB64, 'base64url');
  const derived = (await scryptAsync(password, salt, storedHash.length)) as Buffer;
  if (derived.length !== storedHash.length) return false;
  return crypto.timingSafeEqual(derived, storedHash);
}
