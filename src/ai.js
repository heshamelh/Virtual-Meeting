// Claude integration. Without credentials the HQ runs in simulation mode with templated output,
// so the whole app is usable before you add an API key.
import Anthropic from "@anthropic-ai/sdk";

const MODEL = process.env.HQ_MODEL || "claude-opus-5-5";
const EFFORT = process.env.HQ_EFFORT || "medium";

export const aiEnabled = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
const client = aiEnabled ? new Anthropic() : null;

export const aiInfo = () => ({ enabled: aiEnabled, model: aiEnabled ? MODEL : "simulation" });

/**
 * One Claude call. Returns plain text (markdown).
 * Uses server-side refusal fallbacks so a safety decline is retried on a fallback model
 * instead of returning nothing.
 */
export async function ask({ system, prompt, maxTokens = 16000 }) {
  if (!client) throw new Error("AI disabled");
  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: maxTokens,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: EFFORT },
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: prompt }],
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === "refusal") {
    throw new Error(`Model declined (${msg.stop_details?.category ?? "unspecified"})`);
  }
  const text = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
  if (msg.stop_reason === "max_tokens") return text + "\n\n_(truncated: hit max_tokens)_";
  return text;
}

/** System prompt that turns an employee + their equipped skills into an agent persona. */
export function personaPrompt(company, emp, skills, roster) {
  const equipped = skills.filter((s) => emp.skills.includes(s.id));
  const team = roster.map((r) => `- ${r.name} (${r.role}, ${r.dept})`).join("\n");
  return `You are ${emp.name}, ${emp.role} at ${company.name}.
Company mission: ${company.mission}
Current company priorities: ${company.priorities.join("; ")}
Your personality: ${emp.personality}
Your seniority: level ${emp.level}.

Your teammates:
${team}

Your skills and how you apply them:
${equipped.map((s) => `### ${s.name}\n${s.prompt}`).join("\n\n")}

Work rules:
- Deliver the actual work product, not a plan to do it.
- Be concise and concrete. Use markdown headings, lists and tables where they help.
- If something is outside your skills, say who on the team should own it.
- Never invent facts, numbers or sources; label estimates as estimates.`;
}
