/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === 'production';

const nextConfig = {
  reactStrictMode: true,
  // Keep dev + prod output isolated to avoid stale/mismatched `.next` artifacts causing 404s in dev.
  distDir: isProd ? '.next' : '.next-dev',
  experimental: {
    typedRoutes: true,
  },
  webpack: (config, { dev }) => {
    // Dev-only: avoid filesystem webpack cache writes which can occasionally corrupt `.next` and cause 404s for chunks/css.
    if (dev) config.cache = { type: 'memory' };
    return config;
  },
  // Tighten by removing permissive remotePatterns. Add back only if using next/image.
  // images: { remotePatterns: [{ protocol: 'https', hostname: 'your-allowed-host.com' }] },
  async headers() {
    if (!isProd) {
      // Avoid strict headers in development to not break Next dev features (HMR, eval, etc.)
      return [];
    }
    const csp = [
      "default-src 'self'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "img-src 'self' data: blob:",
      // Next.js requires inline scripts for hydration/runtime.
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "connect-src 'self'",
      "worker-src 'self' blob:",
    ].join('; ');

    const headers = [
      { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      { key: 'Content-Security-Policy', value: csp },
    ];

    return [
      { source: '/:path*', headers },
    ];
  },
};

export default nextConfig;
