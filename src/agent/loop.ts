import Anthropic from "@anthropic-ai/sdk";
import { checkToolCall, type Policy } from "./guardrails.js";
import type { McpConnection } from "./mcp-client.js";
import { TRIAGE_SYSTEM_PROMPT } from "./prompts.js";
import type { Tracer } from "./trace.js";
import { todo } from "../todo.js";

export const anthropic = new Anthropic();
export const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-5-5";

/** Asked before a "confirm" decision runs. Return true to approve. */
export type ConfirmFn = (toolName: string, input: unknown, reason: string) => Promise<boolean>;

export interface AgentResult {
  finalText: string;
  steps: number;
  reason: "done" | "max_steps" | "error" | "refusal";
}

/**
 * TODO(P3-02) Week 7: the agent loop, written by hand.
 *
 *   messages = [{ role: "user", content: task }]
 *   for step in 1..policy.maxSteps:
 *     response = anthropic.messages.create({ model: MODEL, max_tokens, system: TRIAGE_SYSTEM_PROMPT,
 *                                             tools: mcp.tools, messages })
 *     tracer.log model_call (stop_reason, usage, ms)
 *     append { role: "assistant", content: response.content }
 *     if stop_reason is "end_turn": return the final text (reason "done")
 *     if stop_reason is "refusal": return (reason "refusal")
 *     for each tool_use block:
 *       decision = checkToolCall(...)           (P3-03)
 *       deny    -> tool_result with is_error: true and the reason, do not run it
 *       confirm -> await confirm(...); declined -> is_error result saying the human said no
 *       allow   -> await mcp.call(name, input)
 *       tracer.log tool_call
 *     append ONE user message holding ALL the tool_result blocks
 *   return reason "max_steps"
 *
 * Things to learn on the way:
 * - Why must every tool_use get a tool_result, even denied ones? (Try leaving one out.)
 * - What does the model do after a denied or failed tool call? Read the traces.
 * - The SDK also has a tool runner (client.beta.messages.toolRunner) that writes
 *   this loop for you. Build it by hand first; switch later if you want.
 */
export async function runAgent(opts: {
  task: string;
  mcp: McpConnection;
  policy: Policy;
  confirm: ConfirmFn;
  tracer: Tracer;
}): Promise<AgentResult> {
  void opts;
  void anthropic;
  void checkToolCall;
  void TRIAGE_SYSTEM_PROMPT;
  todo("P3-02", "Implement runAgent() in src/agent/loop.ts");
}
