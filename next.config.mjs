/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: true,
  },
  // Tighten by removing permissive remotePatterns. Add back only if using next/image.
  // images: { remotePatterns: [{ protocol: 'https', hostname: 'your-allowed-host.com' }] },
  async headers() {
    const isProd = process.env.NODE_ENV === 'production';
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
      "script-src 'self'",
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
