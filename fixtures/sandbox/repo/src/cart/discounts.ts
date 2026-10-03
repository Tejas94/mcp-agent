export interface DiscountRule {
  kind: "percent" | "fixed";
  /** Percent off for "percent", cents off for "fixed". */
  value: number;
  /** The subtotal must be at least this many cents for the code to apply. */
  minSubtotal: number;
}

export const DISCOUNT_CODES: Record<string, DiscountRule> = {
  SAVE10: { kind: "percent", value: 10, minSubtotal: 5000 },
  WELCOME5: { kind: "fixed", value: 500, minSubtotal: 2000 },
};

/** The discount in cents that `code` gives on `subtotal` cents. 0 when the code does not apply. */
export function discountFor(subtotal: number, code: string): number {
  const rule = DISCOUNT_CODES[code.trim().toUpperCase()];
  if (!rule) return 0;
  if (subtotal < rule.minSubtotal) return 0;
  const amount = rule.kind === "percent" ? Math.round((subtotal * rule.value) / 100) : rule.value;
  return Math.min(amount, subtotal);
}
