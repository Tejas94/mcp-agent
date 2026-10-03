/** Orders worth this many cents or more after discounts ship free. */
export const FREE_SHIPPING_FROM = 7500;

const RATES: Record<string, number> = {
  US: 599,
};

const INTERNATIONAL = 1499;

/** Shipping in cents for an order worth `amount` cents after discounts. */
export function shippingCost(amount: number, country: string): number {
  if (amount >= FREE_SHIPPING_FROM) return 0;
  return RATES[country.toUpperCase()] ?? INTERNATIONAL;
}
