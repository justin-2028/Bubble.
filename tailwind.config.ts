import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}'
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['var(--font-dm-sans)', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        nav: ['var(--font-dm-sans)', 'sans-serif'],
        body: ['var(--font-dm-sans)', 'sans-serif'],
        code: ['var(--font-fragment-mono)', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace']
      },
      letterSpacing: {
        'tight-display': '-0.05em',
        'tight-ui': '-0.03em'
      },
      lineHeight: {
        'tight-display': '0.9'
      },
      colors: {
        glass: 'rgba(255,255,255,0.35)'
      },
      boxShadow: {
        glass: '0 8px 32px rgba(0,0,0,0.12)'
      }
    }
  },
  plugins: []
};

export default config;
