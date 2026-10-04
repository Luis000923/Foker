// Import circular a propósito: cart.ts ↔ audit.ts.
import type { Cart } from './cart';

export function audit(cart: Cart, action: string): void {
  void cart;
  void action;
}
