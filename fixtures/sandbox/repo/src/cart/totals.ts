import type { Cart } from "./cart.js";
import { discountFor } from "./discounts.js";
import { shippingCost } from "../checkout/shipping.js";

/** Everything the order summary shows. All amounts are in cents. */
export interface Totals {
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
}

export interface TotalsOptions {
  discountCode?: string;
  /** ISO country code, such as "US". */
  country: string;
}

export function calculateTotals(cart: Cart, opts: TotalsOptions): Totals {
  const subtotal = cart.lines().reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
  const discount = opts.discountCode ? discountFor(subtotal, opts.discountCode) : 0;
  const afterDiscount = applyDiscount(subtotal, discount) - discount;
  const shipping = shippingCost(afterDiscount, opts.country);
  return { subtotal, discount, shipping, total: afterDiscount + shipping };
}

function applyDiscount(amount: number, discount: number): number {
  return Math.max(0, amount - discount);
}
