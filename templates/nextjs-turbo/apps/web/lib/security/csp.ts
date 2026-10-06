export function buildCsp(nodeEnv: 'development' | 'production' | 'test'): string {
  const developmentScripts = nodeEnv === 'development' ? " 'unsafe-eval'" : '';
  return `default-src 'self'; script-src 'self' 'unsafe-inline'${developmentScripts}; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'`;
}
