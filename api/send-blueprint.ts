import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(
  req: { method: string; body: { email: string; pdfBase64: string; userName: string } },
  res: {
    status: (code: number) => { json: (data: unknown) => void; end: () => void };
  }
) {
  if (req.method !== "POST") {
    return res.status(405).end();
  }

  const { email, pdfBase64, userName } = req.body;

  // Basic validation
  if (!email || !email.includes("@") || !pdfBase64) {
    return res.status(400).json({ error: "Missing or invalid fields." });
  }

  const firstName = (userName || "").trim().split(" ")[0] || "there";

  const { error } = await resend.emails.send({
    // TODO: Replace with your verified domain — e.g. "Blueprint <blueprint@yourdomain.com>"
    // During testing you can send to your own email using "onboarding@resend.dev" as the from address.
    from: "Leverage Blueprint <onboarding@resend.dev>",
    to: email,
    subject: "Your Leverage Blueprint is ready",
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; color: #111827;">
        <div style="background: linear-gradient(135deg, #1e1b4b 0%, #18181b 100%); border-radius: 16px; padding: 40px 36px; margin-bottom: 24px;">
          <div style="font-size: 11px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #a78bfa; margin-bottom: 12px;">Equanimity Engine</div>
          <h1 style="font-size: 26px; font-weight: 700; color: #ffffff; margin: 0 0 8px;">Your Leverage Blueprint</h1>
          <p style="font-size: 14px; color: #a1a1aa; margin: 0;">Personalised financial independence strategy</p>
        </div>

        <p style="font-size: 15px; color: #374151; margin: 0 0 16px;">Hi ${firstName},</p>
        <p style="font-size: 15px; color: #374151; margin: 0 0 24px;">
          Your personalised Leverage Blueprint is attached to this email as a PDF.
          It contains your executive diagnosis, bottleneck analysis, and 12-month action roadmap.
        </p>

        <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px 24px; margin-bottom: 24px;">
          <div style="font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 12px;">What's inside</div>
          <ul style="margin: 0; padding: 0; list-style: none;">
            <li style="font-size: 14px; color: #374151; padding: 4px 0;">✦ &nbsp;Executive diagnosis &amp; Leverage Score breakdown</li>
            <li style="font-size: 14px; color: #374151; padding: 4px 0;">✦ &nbsp;Bottleneck identification &amp; priority actions</li>
            <li style="font-size: 14px; color: #374151; padding: 4px 0;">✦ &nbsp;12-month leverage roadmap</li>
            <li style="font-size: 14px; color: #374151; padding: 4px 0;">✦ &nbsp;Scenario modeling &amp; milestone projections</li>
          </ul>
        </div>

        <p style="font-size: 13px; color: #9ca3af; margin: 0; border-top: 1px solid #f3f4f6; padding-top: 20px;">
          This PDF was generated from your inputs on the Equanimity Engine. Keep it — your numbers are unique to you.
        </p>
      </div>
    `,
    attachments: [
      {
        filename: `Leverage-Blueprint-${new Date().toISOString().slice(0, 10)}.pdf`,
        content: Buffer.from(pdfBase64, "base64"),
      },
    ],
  });

  if (error) {
    console.error("Resend error:", error);
    return res.status(500).json({ error: "Failed to send email. Please try again." });
  }

  return res.status(200).json({ success: true });
}
