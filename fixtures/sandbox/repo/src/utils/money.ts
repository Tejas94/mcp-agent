export type Currency = "USD" | "EUR";

const SYMBOLS: Record<Currency, string> = { USD: "$", EUR: "€" };

/** 1234 -> "$12.34" */
export function formatMoney(cents: number, currency: Currency = "USD"): string {
  const sign = cents < 0 ? "-" : "";
  return `${sign}${SYMBOLS[currency]}${(Math.abs(cents) / 100).toFixed(2)}`;
}
