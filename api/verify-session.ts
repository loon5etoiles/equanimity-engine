import { webcrypto } from "node:crypto";
if (!globalThis.crypto) { (globalThis as any).crypto = webcrypto; }


import Stripe from "stripe";
import { Redis } from "@upstash/redis";
import { SignJWT } from "jose";

// Derive product from amount_total — no metadata needed
// Amounts are in cents: $197.00 = 19700, $47.00 = 4700
function deriveProduct(amountTotal: number | null): string {
  if (amountTotal === 4700) return "stress_test";
  return "blueprint"; // default / $197
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return res.status(405).end();

  const { sessionId } = req.body as { sessionId: string };
  if (!sessionId) return res.status(400).json({ error: "Missing sessionId" });

  // Initialize inside handler so env vars are guaranteed to be available
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  });
  const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET!);


  try {
    // Reject already-consumed sessions — prevents URL replay after localStorage clear
    const consumedKey = `session_consumed:${sessionId}`;
    const alreadyConsumed = await redis.get(consumedKey);
    if (alreadyConsumed) {
      return res.status(403).json({ error: "Session already used" });
    }

    // Verify payment directly with Stripe — never trust client-supplied data
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== "paid") {
      return res.status(402).json({ error: "Payment not confirmed" });
    }

    const email = (session.customer_email ?? session.customer_details?.email ?? "").toLowerCase();
    const product = deriveProduct(session.amount_total);

    // Fetch all products this email has ever purchased
    const products: string[] = email
      ? await redis.smembers(`purchases:${email}`)
      : [product];

    // Ensure this purchase is recorded (webhook may not have fired yet)
    if (email && !products.includes(product)) {
      await redis.sadd(`purchases:${email}`, product);
      products.push(product);
    }

    // Issue a signed JWT — 90 day expiry
    const token = await new SignJWT({ email, products })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("90d")
      .sign(JWT_SECRET);

    // Mark session as consumed — prevents URL replay
    await redis.set(consumedKey, "1", { ex: 365 * 24 * 3600 });

    return res.status(200).json({ token, products });
  } catch (err) {
    console.error("verify-session error:", err);
    return res.status(500).json({ error: "Failed to verify session" });
  }
}
