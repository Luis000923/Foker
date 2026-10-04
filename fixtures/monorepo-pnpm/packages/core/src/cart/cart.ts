import type { CartItem, CartId } from './types';
import { CartStatus } from './types';
import { audit } from './audit';

/** Carrito de la compra. */
export class Cart {
  private readonly items: CartItem[] = [];
  status: CartStatus = CartStatus.Open;

  constructor(readonly id: CartId) {}

  /** Añade un artículo. */
  add(item: CartItem): void {
    this.items.push(item);
    audit(this, 'add');
  }

  total(): number {
    return this.items.reduce((sum, item) => sum + item.price, 0);
  }

  static empty(id: CartId): Cart {
    return new Cart(id);
  }
}

export function createCart(id: CartId): Cart;
export function createCart(id: CartId, items: CartItem[]): Cart;
export function createCart(id: CartId, items: CartItem[] = []): Cart {
  const cart = new Cart(id);
  for (const item of items) cart.add(item);
  return cart;
}

export namespace CartUtils {
  export const MAX_ITEMS = 100;
  export function isFull(cart: Cart): boolean {
    return cart.total() > MAX_ITEMS;
  }
}
