import type { Cart } from "../cart/cart.js";
import { calculateTotals } from "../cart/totals.js";
import { saveOrder, type Order } from "../orders/orders.js";
import type { PaymentsClient } from "../payments/client.js";
import { logger } from "../utils/logger.js";
import type { Currency } from "../utils/money.js";

export interface CheckoutRequest {
  cart: Cart;
  email: string;
  country: string;
  currency: Currency;
  /** A card token from the payment provider's browser SDK. */
  cardToken: string;
  discountCode?: string;
}

export async function checkout(req: CheckoutRequest, payments: PaymentsClient): Promise<Order> {
  if (req.cart.isEmpty()) throw new Error("Cart is empty");

  const totals = calculateTotals(req.cart, { discountCode: req.discountCode, country: req.country });
  const orderId = `ord_${Date.now()}`;
  const charge = await payments.charge({
    orderId,
    amount: totals.total,
    currency: req.currency,
    cardToken: req.cardToken,
  });
  if (charge.status !== "succeeded") throw new Error("Payment declined");

  const order = saveOrder({ id: orderId, email: req.email, lines: req.cart.lines(), totals, chargeId: charge.id });
  logger.info(`Order ${orderId} placed`);
  return order;
}
