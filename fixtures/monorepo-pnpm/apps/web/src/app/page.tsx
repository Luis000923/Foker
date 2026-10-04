import { Button } from '@mono/ui';
import { formatPrice } from '@/lib/format';
import type { CartItem } from '@mono/core';

/**
 * Página de inicio.
 *
 * Muestra el total del carrito.
 */
export default function HomePage({ items }: { items: CartItem[] }): JSX.Element {
  const total = items.reduce((sum, item) => sum + item.price, 0);
  return <Button variant="primary">{formatPrice(total)}</Button>;
}
