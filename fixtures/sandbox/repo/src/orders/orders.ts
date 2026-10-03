import type { CartLine } from "../cart/cart.js";
import type { Totals } from "../cart/totals.js";

export interface Order {
  id: string;
  email: string;
  lines: CartLine[];
  totals: Totals;
  chargeId: string;
  createdAt: string;
}

const orders = new Map<string, Order>();

export function saveOrder(input: Omit<Order, "createdAt">): Order {
  const order = { ...input, createdAt: new Date().toISOString() };
  orders.set(order.id, order);
  return order;
}

export function getOrder(id: string): Order | undefined {
  return orders.get(id);
}

export function ordersFor(email: string): Order[] {
  return [...orders.values()].filter((o) => o.email === email);
}
