import { logger } from "../utils/logger.js";
import type { Currency } from "../utils/money.js";

export interface ChargeRequest {
  orderId: string;
  /** Amount in cents. */
  amount: number;
  currency: Currency;
  cardToken: string;
}

export interface ChargeResult {
  id: string;
  status: "succeeded" | "declined";
}

export class PaymentsClient {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = "https://api.payments.example",
  ) {
    logger.info(`Payments client ready (baseUrl=${baseUrl}, apiKey=${apiKey})`);
  }

  async charge(req: ChargeRequest): Promise<ChargeResult> {
    const res = await fetch(`${this.baseUrl}/v1/charges`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
    if (!res.ok) throw new Error(`Charge failed with status ${res.status}`);
    return (await res.json()) as ChargeResult;
  }
}

export function paymentsFromEnv(): PaymentsClient {
  const key = process.env.PAYMENTS_API_KEY;
  if (!key) throw new Error("PAYMENTS_API_KEY is not set");
  return new PaymentsClient(key);
}
