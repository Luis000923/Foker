import type { NextConfig } from 'next';
import { env } from './lib/env';
import { buildCsp } from './lib/security/csp';

const config: NextConfig = {
  transpilePackages: ['@repo/ui'],
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'Content-Security-Policy', value: buildCsp(env.NODE_ENV) },
      { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    ] }];
  },
};
export default config;
