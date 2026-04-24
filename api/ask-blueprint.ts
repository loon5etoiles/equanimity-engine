// api/ask-blueprint.ts — Streaming Q&A grounded in the user's Blueprint inputs.
// Accepts a conversation history + the user's current numbers, streams plain
// text chunks back to the client which renders them word-by-word.
//
// Post-purchase feature: lets a Blueprint owner ask follow-up questions like
// "What if I move to Austin?", "Should I max 401k or pay down mortgage?",
// etc. with responses grounded by their actual calculator inputs.

import { streamText, convertToModelMessages, type UIMessage } from "ai";
import type { IncomingMessage, ServerResponse } from "http";

export const config = { runtime: "nodejs", maxDuration: 60 };

interface UserContext {
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

function buildSystem(ctx: UserContext): string {
  const firstName = (ctx.userName || "").trim().split(" ")[0];
  const yrs = ctx.yearsToFreedom != null
    ? `${ctx.yearsToFreedom.toFixed(1)} years`
    : "not yet computable";

  return `You are the Blueprint coach — a senior financial operator answering follow-up questions for a Blueprint owner. Your voice is direct, analytical, and confident. You never hedge, never use corporate jargon, and never give generic advice. Every answer references the user's actual numbers.

THE USER'S NUMBERS (use these in every relevant answer):
${firstName ? `- First name: ${firstName}` : "- No name on file; address the user in second person ('you')"}
- Age: ${ctx.age}
- Monthly income: $${ctx.monthlyIncome.toLocaleString()}
- Monthly expenses: $${ctx.monthlyExpenses.toLocaleString()}
- Monthly surplus: $${ctx.surplus.toLocaleString()} (savings rate ${ctx.savingsRatePct.toFixed(0)}%)
- Invested assets: $${ctx.investedStart.toLocaleString()}
- Emergency cash: $${ctx.cashStart.toLocaleString()}
- Monthly investment contribution: $${ctx.monthlyInvest.toLocaleString()}
- Checking buffer target: $${ctx.bufferTarget.toLocaleString()}
- Leverage Score: ${ctx.leverageScore}/100 (${ctx.leverageLabel})
- Primary bottleneck: ${ctx.bottleneckLabel}
- Cash runway: ${ctx.runwayMonths.toFixed(1)} months
- Freedom Number: $${ctx.freedomNumber.toLocaleString()}
- User's target: $${ctx.target.toLocaleString()}
- Years to Freedom: ${yrs}

HOW TO ANSWER:
1. Keep responses tight — 2-4 short paragraphs, no essays. This is a conversation, not a lecture.
2. When the user asks a scenario question ("what if I...?"), do the actual math using their numbers. Show the before/after.
3. Cite specific dollar figures from their situation. Do not write "your income" when you can write "your $${Math.round(ctx.monthlyIncome/1000)}k monthly".
4. Never recommend specific stocks, funds, or guarantee returns. Talk about strategy, allocation principles, and sequencing — not "buy VTSAX".
5. If the question is unrelated to personal finance, redirect ONCE in one sentence back to their Blueprint, then answer briefly.
6. Close with a concrete next step when useful — not a motivational line.

TONE GUARDRAILS:
- Never write "it's important to" or "I recommend consulting" — the user already bought the product.
- Never open with "Great question" or "That's a thoughtful question".
- Never end with "I hope this helps" or "let me know if you have more questions".
- Do not use bullet lists for answers under 100 words; write in prose.
- Educational only — never present as personal financial advice.`;
}

export default async function handler(
  req: IncomingMessage & { body?: { messages?: UIMessage[]; userContext?: UserContext }; method?: string },
  res: ServerResponse & { status: (code: number) => { json: (data: unknown) => void; end: () => void } }
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = req.body;
  const messages = body?.messages;
  const userContext = body?.userContext;

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages array required" });
  }
  if (!userContext || typeof userContext.monthlyIncome !== "number") {
    return res.status(400).json({ error: "userContext required" });
  }

  if (!process.env.AI_GATEWAY_API_KEY) {
    return res.status(500).json({ error: "Server missing AI_GATEWAY_API_KEY" });
  }

  try {
    const modelMessages = await convertToModelMessages(messages);
    const result = streamText({
      model: "anthropic/claude-sonnet-4-6",
      system: buildSystem(userContext),
      messages: modelMessages,
      temperature: 0.7,
    });

    // Stream plain text chunks directly. Client reads via fetch + ReadableStream.
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("X-Accel-Buffering", "no");
    if (typeof res.flushHeaders === "function") res.flushHeaders();

    for await (const chunk of result.textStream) {
      res.write(chunk);
    }
    res.end();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("ask-blueprint error:", err);
    if (!res.headersSent) {
      return res.status(502).json({ error: "Chat engine unavailable", detail: message });
    }
    try { res.end(); } catch {}
  }
}
