import 'server-only';

export const SESSION_COOKIE_NAME = 'bubble_session';

export function getAdminUsername() {
  return (process.env.BUBBLE_ADMIN_USERNAME || 'admin').trim();
}

export function getAdminPasswordHash() {
  return (process.env.BUBBLE_ADMIN_PASSWORD_HASH || '').trim();
}

export function getAdminPassword() {
  return (process.env.BUBBLE_ADMIN_PASSWORD || '').trim();
}

export function getSessionSecret() {
  return (process.env.BUBBLE_SESSION_SECRET || process.env.NEXTAUTH_SECRET || '').trim();
}

export function getStorageSecret() {
  return (process.env.BUBBLE_STORAGE_SECRET || getSessionSecret()).trim();
}

export function isAuthConfigured() {
  return !!(getAdminPasswordHash() || getAdminPassword());
}

export function isSessionConfigured() {
  return !!getSessionSecret();
}

export function isBlobConfigured() {
  return !!(process.env.BLOB_READ_WRITE_TOKEN || '').trim();
}

export function requiresDurableHostedStorage() {
  return process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
}
