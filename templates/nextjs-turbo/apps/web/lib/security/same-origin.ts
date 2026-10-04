/** Usar antes de procesar entradas en handlers con mutación.
 * Compara con la URL del request; el proxy debe proporcionar una URL fiable.
 * No confía en X-Forwarded-* ni sustituye autenticación/autorización.
 */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get('origin');
  if (!origin || origin !== new URL(request.url).origin) {
    throw new Error('Origen no permitido');
  }
}
