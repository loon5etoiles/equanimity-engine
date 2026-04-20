// api/send-desktop-link.ts — Sends a reminder email to users browsing on mobile
// inviting them to return to the calculator on desktop. Captures the email as
// a soft lead so we can follow up with marketing / reminders.

import { Resend } from "resend";
import { Redis } from "@upstash/redis";

const resend = new Resend(process.env.RESEND_API_KEY);
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || "",
  token: process.env.UPSTASH_REDIS_REST_TOKEN || "",
});

export default async function handler(
  req: { method: string; body: { email: string } },
  res: { status: (code: number) => { json: (data: unknown) => void; end: () => void } }
) {
  if (req.method !== "POST") {
    return res.status(405).end();
  }

  const { email } = req.body;

  if (!email || !email.includes("@")) {
    return res.status(400).json({ error: "Please enter a valid email." });
  }

  // Store lead in Redis (fire-and-forget — don't block email on this)
  try {
    await redis.sadd("desktop_reminders", email.toLowerCase().trim());
    await redis.set(`desktop_reminder:${email.toLowerCase().trim()}`, new Date().toISOString());
  } catch (e) {
    console.error("Redis error (non-fatal):", e);
  }

  const { error } = await resend.emails.send({
    from: "Equanimity Engine <onboarding@resend.dev>",
    to: email,
    subject: "Your link to the Equanimity Engine",
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; color: #111827;">
        <div style="background: linear-gradient(135deg, #1e1b4b 0%, #18181b 100%); border-radius: 16px; padding: 40px 36px; margin-bottom: 24px;">
          <div style="font-size: 11px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #a78bfa; margin-bottom: 12px;">Equanimity Engine</div>
          <h1 style="font-size: 24px; font-weight: 700; color: #ffffff; margin: 0 0 8px;">Continue on your laptop</h1>
          <p style="font-size: 14px; color: #a1a1aa; margin: 0;">The Leverage Score calculator works best on a larger screen.</p>
        </div>

        <p style="font-size: 15px; color: #374151; margin: 0 0 16px;">Hi,</p>
        <p style="font-size: 15px; color: #374151; margin: 0 0 24px;">
          When you're back at a desk, open the Equanimity Engine and give yourself 10 minutes
          to complete the calculator. You'll get your personal Leverage Score, identify your
          financial bottleneck, and see your 12-month runway projection — all free.
        </p>

        <div style="text-align: center; margin: 32px 0;">
          <a href="https://www.equanimityengine.com"
             style="display: inline-block; background: linear-gradient(135deg, #2563eb, #7c3aed);
                    color: #ffffff; font-weight: 600; font-size: 15px;
                    padding: 14px 32px; border-radius: 12px; text-decoration: none;">
            Open the Equanimity Engine →
          </a>
        </div>

        <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px 24px; margin-bottom: 24px;">
          <div style="font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 12px;">What you'll get</div>
          <ul style="margin: 0; padding: 0; list-style: none;">
            <li style="font-size: 14px; color: #374151; padding: 4px 0;">✦ &nbsp;Your Leverage Score (0&ndash;100) across 4 pillars</li>
            <li style="font-size: 14px; color: #374151; padding: 4px 0;">✦ &nbsp;Your Freedom Number &mdash; the net worth that buys optionality</li>
            <li style="font-size: 14px; color: #374151; padding: 4px 0;">✦ &nbsp;Your bottleneck &mdash; the one pillar to fix first</li>
            <li style="font-size: 14px; color: #374151; padding: 4px 0;">✦ &nbsp;Runway stress testing for layoff, market crash, medical events</li>
          </ul>
        </div>

        <p style="font-size: 13px; color: #9ca3af; margin: 0; border-top: 1px solid #f3f4f6; padding-top: 20px;">
          No spam, no upsell pressure. Just the link for when you're ready.
        </p>
      </div>
    `,
  });

  if (error) {
    console.error("Resend error:", error);
    return res.status(500).json({ error: "Failed to send email. Please try again." });
  }

  return res.status(200).json({ success: true });
}
