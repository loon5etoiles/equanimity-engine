// api/generate-narrative.ts — AI-generated personalised Blueprint narrative.
// Takes the user's calculator inputs + computed metrics and returns a 3-section
// narrative (executive diagnosis, bottleneck deep-dive, strategic commitment)
// that gets embedded as the opening pages of the Blueprint PDF.
//
// Uses the Vercel AI Gateway (no provider package needed — plain "anthropic/..."
// model string). Structured output enforced via Zod schema.

import { generateObject } from "ai";
import { z } from "zod";

export const config = { runtime: "nodejs" };

const NarrativeSchema = z.object({
  executiveDiagnosis: z
    .string()
    .describe(
      "A 2-3 paragraph executive opening that names the user, cites their actual numbers, and gives an honest assessment of their financial position. Direct and analytical, never generic. No bullet points. Opens the Blueprint."
    ),
  bottleneckDeepDive: z
    .string()
    .describe(
      "A 1-2 paragraph explanation of why the identified bottleneck pillar is their constraint, referencing their specific numbers. Include the behavioural or structural pattern that likely created it. No bullet points."
    ),
  strategicCommitment: z
    .string()
    .describe(
      "A single tight paragraph (3-5 sentences) acting as the 'operator mandate' — the one-line strategic thesis they should operate from for the next 12 months. Personalised to their numbers."
    ),
});

export type BlueprintNarrative = z.infer<typeof NarrativeSchema>;

interface NarrativeInput {
  userName?: string;
  age: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  investedStart: number;
  cashStart: number;
  monthlyInvest: number;
  bufferTarget: number;
  target: number;
  leverageScore: number;
  leverageLabel: string;
  bottleneckKey: string;
  bottleneckLabel: string;
  runwayMonths: number;
  yearsToFreedom: number | null;
  freedomNumber: number;
  savingsRatePct: number;
  surplus: number;
}

function buildUserMessage(input: NarrativeInput) {
  const firstName = (input.userName || "").trim().split(" ")[0] || "the operator";
  const yrs = input.yearsToFreedom != null ? `${input.yearsToFreedom.toFixed(1)} years` : "not yet computable (expenses exceed income or invest rate is zero)";

  return `Generate a personalised financial Blueprint narrative for this operator.

SUBJECT
- First name: ${firstName}
- Age: ${input.age}

MONTHLY CASHFLOW
- Income: $${input.monthlyIncome.toLocaleString()}
- Expenses: $${input.monthlyExpenses.toLocaleString()}
- Surplus: $${input.surplus.toLocaleString()}
- Savings rate: ${input.savingsRatePct.toFixed(0)}%
- Committed monthly investment: $${input.monthlyInvest.toLocaleString()}

BALANCE SHEET
- Invested assets: $${input.investedStart.toLocaleString()}
- Emergency cash: $${input.cashStart.toLocaleString()}
- Checking buffer target: $${input.bufferTarget.toLocaleString()}

TARGETS & METRICS
- Freedom Number (expenses × 25): $${input.freedomNumber.toLocaleString()}
- User-set target: $${input.target.toLocaleString()}
- Time to Freedom Number: ${yrs}
- Cash runway in months: ${input.runwayMonths.toFixed(1)}

LEVERAGE SCORE
- Total: ${input.leverageScore}/100
- Class: ${input.leverageLabel}
- Bottleneck (primary constraint): ${input.bottleneckLabel} (key: ${input.bottleneckKey})

INSTRUCTIONS
Write all three sections in the voice of a senior financial operator/coach — direct, analytical, confident, never hedging. No emojis. No bullet points inside the text blocks. Use the first name once or twice where natural.

Reference the actual numbers throughout — never write "your income" when you can write "your $${Math.round(input.monthlyIncome/1000)}k monthly". Never give generic advice like "build an emergency fund"; give specific, sized advice like "increase your cash position to $${Math.round(input.monthlyExpenses * 6).toLocaleString()}, which is 6 months of your current burn".

The executive diagnosis should feel like a senior advisor reading their numbers and telling them the honest truth in under 250 words. The bottleneck deep-dive should explain WHY this is the constraint using their numbers — what's structural, what's behavioural. The strategic commitment is a short, memorable directive they can operate from.`;
}

export default async function handler(
  req: { method: string; body: NarrativeInput },
  res: {
    status: (code: number) => { json: (data: unknown) => void; end: () => void };
  }
) {
  if (req.method !== "POST") {
    return res.status(405).end();
  }

  const input = req.body;
  if (!input || typeof input.monthlyIncome !== "number") {
    return res.status(400).json({ error: "Missing or invalid input." });
  }

  if (!process.env.AI_GATEWAY_API_KEY) {
    return res
      .status(500)
      .json({ error: "Server missing AI_GATEWAY_API_KEY" });
  }

  try {
    const { object } = await generateObject({
      // Claude Haiku 4.5 via Vercel AI Gateway — fast + cheap, adequate for this
      // personalised-narrative task. Swap to "anthropic/claude-sonnet-4-5" for
      // higher quality if the prompt reaches its ceiling.
      model: "anthropic/claude-haiku-4-5",
      schema: NarrativeSchema,
      system:
        "You are a senior financial operator writing a personal Blueprint for a high-income professional. Your voice is direct, analytical, and confident. You never hedge, never use corporate jargon, and never give generic advice. Every sentence references the subject's actual numbers. You write as if the reader already knows what compounding and stress tests are — you respect their intelligence.",
      prompt: buildUserMessage(input),
      temperature: 0.7,
    });

    return res.status(200).json(object);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("generate-narrative error:", err);
    return res
      .status(502)
      .json({ error: "Narrative engine unavailable", detail: message });
  }
}
