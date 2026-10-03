/**
 * Turns a tool call into the exact action a human is asked to approve: the full comment,
 * the full review with every inline comment, or the close and its reason. The CLI prints
 * this before the y/N prompt, so nobody approves text they have not seen.
 */
export function describeAction(name: string, input: unknown): string {
  const i = (input ?? {}) as Record<string, unknown>;
  const num = typeof i.number === "number" ? `#${i.number}` : "#?";
  const indent = (text: unknown) =>
    String(text ?? "")
      .split("\n")
      .map((l) => `    ${l}`)
      .join("\n");

  switch (name) {
    case "add_comment":
      return `Post this comment on ${num}:\n\n${indent(i.body)}`;
    case "submit_review": {
      const comments = Array.isArray(i.comments) ? (i.comments as Record<string, unknown>[]) : [];
      const inline = comments.map((c) => `  ${String(c.path)}:${String(c.line)}\n${indent(c.body)}`).join("\n\n");
      return [
        `Submit a ${String(i.event ?? "?")} review on PR ${num}:`,
        "",
        indent(i.body),
        ...(comments.length ? ["", `Inline comments (${comments.length}):`, "", inline] : []),
      ].join("\n");
    }
    case "close_issue":
      return `Close issue ${num} as ${String(i.reason ?? "?")}.`;
    case "add_labels":
      return `Add labels ${Array.isArray(i.labels) ? i.labels.join(", ") : "?"} to ${num}.`;
    default:
      return `${name} ${JSON.stringify(input, null, 2)}`;
  }
}
