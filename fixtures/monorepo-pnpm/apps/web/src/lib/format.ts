/** Formatea un precio en euros. */
export function formatPrice(cents: number): string {
  return `${(cents / 100).toFixed(2)} €`;
}

export const CURRENCY = 'EUR';
