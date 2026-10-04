export interface CartItem {
  id: string;
  price: number;
}

export type CartId = string;

export enum CartStatus {
  Open = 'open',
  Closed = 'closed',
}
