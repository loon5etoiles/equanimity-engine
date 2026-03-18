import Stripe from "stripe";
import { Redis } from "@upstash/redis";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// Vercel: disable body parsing so we can read the raw buffer for signature verification
export const config = { api: { bodyParser: false } };

async function getRawBody(req: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return res.status(405).end();

  const sig = req.headers["stripe-signature"];
  let event: Stripe.Event;

  try {
    const rawBody = await getRawBody(req);
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch {
    return res.status(400).json({ error: "Webhook signature verification failed" });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    if (session.payment_status === "paid") {
      const email = (session.customer_email ?? session.customer_details?.email ?? "").toLowerCase();
      const product = session.amount_total === 4700 ? "stress_test" : "blueprint";

      if (email) {
        // Store purchase keyed by email (set = no duplicates)
        await redis.sadd(`purchases:${email}`, product);
        // Store session → email mapping for verify-session lookup (24h TTL)
        await redis.set(`session:${session.id}`, { email, product }, { ex: 86400 });
      }
    }
  }

  res.status(200).json({ received: true });
}
