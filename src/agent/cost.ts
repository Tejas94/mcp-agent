import type { TraceEvent } from "./trace.js";

/** US dollars per million tokens. Check the pricing page when you change models. */
export const PRICES: Record<string, { input: number; output: number }> = {
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

/** Cost of one run in USD, or null for a model with no price here. Output tokens include thinking. */
export function costUsd(model: string, inputTokens: number, outputTokens: number): number | null {
  const price = PRICES[model];
  if (!price) return null;
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}

/** Adds up the model_call events of a trace. */
export function usageFromEvents(events: TraceEvent[]): { modelCalls: number; inputTokens: number; outputTokens: number } {
  const calls = events.filter((e): e is Extract<TraceEvent, { type: "model_call" }> => e.type === "model_call");
  return {
    modelCalls: calls.length,
    inputTokens: calls.reduce((sum, e) => sum + e.inputTokens, 0),
    outputTokens: calls.reduce((sum, e) => sum + e.outputTokens, 0),
  };
}

export function formatUsd(usd: number | null): string {
  return usd === null ? "n/a" : `$${usd.toFixed(4)}`;
}
