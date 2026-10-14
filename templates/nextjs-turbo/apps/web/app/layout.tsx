import type { ReactNode } from 'react';
import '../lib/env';
import './tokens.css';

export default function Layout({ children }: { children: ReactNode }) {
  return <html lang="es"><body>{children}</body></html>;
}
