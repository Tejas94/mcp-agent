import Anthropic from "@anthropic-ai/sdk";
import { checkToolCall, type Policy } from "./guardrails.js";
import type { McpConnection } from "./mcp-client.js";
import { SYSTEM_PROMPT } from "./prompts.js";
import type { RunEndReason, Tracer } from "./trace.js";
import { todo } from "../todo.js";

export const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";

/** Asked before a "confirm" decision runs. Resolve true to approve. */
export type ConfirmFn = (toolName: string, input: unknown, reason: string) => Promise<boolean>;

export interface AgentResult {
  finalText: string;
  /** Model calls made. */
  steps: number;
  reason: RunEndReason;
}

export interface RunOptions {
  task: string;
  mcp: McpConnection;
  policy: Policy;
  confirm: ConfirmFn;
  tracer: Tracer;
  /** Defaults to MODEL (ANTHROPIC_MODEL, then claude-opus-5-5). */
  model?: string;
  /** Defaults to `new Anthropic()`. Pass a fake to test the loop without the API. */
  client?: Anthropic;
}

/**
 * TODO(P3-03) Week 7: the agent loop, written by hand, and its system prompt (prompts.ts).
 *
 *   client = opts.client ?? new Anthropic();  model = opts.model ?? MODEL
 *   messages: Anthropic.MessageParam[] = [{ role: "user", content: task }]
 *   state = { writesSoFar: 0 }
 *   for step in 1..policy.maxSteps:
 *     response = await client.messages.create({ model, max_tokens, system: SYSTEM_PROMPT,
 *                                               tools: mcp.tools, messages, output_config: { effort } })
 *     tracer.log model_call (step, stop_reason, usage.input_tokens, usage.output_tokens, ms)
 *     append { role: "assistant", content: response.content }    <- all of it, unchanged
 *     "end_turn"   -> return { finalText: the text blocks joined, steps: step, reason: "done" }
 *     "refusal"    -> return reason "refusal";  "max_tokens" -> return reason "max_tokens"
 *     results = []
 *     for each tool_use block, in order:
 *       decision = checkToolCall(block.name, block.input, policy, state)          (P3-02)
 *       deny    -> outcome = { text: decision.reason, isError: true }; the tool does not run
 *       confirm -> approved = await confirm(block.name, block.input, decision.reason)
 *                  no  -> outcome = { text: "A human declined this action. Do not retry it.", isError: true }
 *                  yes -> outcome = await mcp.call(block.name, block.input)
 *       allow   -> outcome = await mcp.call(block.name, block.input)
 *       if it ran and the tool is a write or approval tool: state.writesSoFar += 1
 *       content = outcome.text   (week 8: content = prepareToolResult(block.name, outcome), P3-04)
 *       tracer.log tool_call (step, name, input, decision.action, approved, executed, result: content, isError, ms)
 *       results.push({ type: "tool_result", tool_use_id: block.id, content, is_error })
 *     append ONE user message holding ALL the tool_result blocks
 *   return { finalText: "Stopped after policy.maxSteps steps.", steps, reason: "max_steps" }
 *
 * The callers (src/cli.ts and evals/run.ts) log run_start and run_end, so the loop does not.
 *
 * Constraints:
 * - Every tool_use gets exactly one tool_result with the same id, even denied and declined
 *   ones, or the next request fails.
 * - Never edit or drop earlier messages. claude-opus-5-5 always thinks, so response.content
 *   starts with thinking blocks (their text is empty by default). They must go back exactly
 *   as received, and editing an earlier turn invalidates them.
 * - Thinking tokens count toward max_tokens. Size it for thinking plus the reply
 *   (16000 is a sensible start for a non-streaming call).
 * - Effort is the knob for how much the model thinks: output_config: { effort: "medium" }
 *   (the default on claude-opus-5-5). claude-haiku-4-5 rejects effort, so leave it out there.
 * - Do not force a tool with tool_choice; current models reject a forced tool_choice. The
 *   prompt and good tool descriptions steer which tool gets used.
 *
 * Things to learn on the way:
 * - Leave one tool_result out on purpose. What does the API say?
 * - What does the model do after a denied or declined call? Read the trace.
 * - Set max_tokens to 1024 and give it a review task. What stop_reason do you get, and why?
 * - Run the same task at effort "low" and "high". Compare steps, tokens and the result.
 * - The SDK has a tool runner (client.beta.messages.toolRunner) that writes this loop for
 *   you, with hooks for approvals. Build it by hand first; compare later.
 */
export async function runAgent(opts: RunOptions): Promise<AgentResult> {
  void opts;
  void Anthropic;
  void checkToolCall;
  void SYSTEM_PROMPT;
  todo("P3-03", "Implement runAgent() in src/agent/loop.ts");
}
