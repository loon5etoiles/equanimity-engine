import { jwtVerify } from "jose";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET!);

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return res.status(405).end();

  const { token } = req.body as { token: string };
  if (!token) return res.status(401).json({ valid: false });

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    const { email, products: tokenProducts } = payload as {
      email: string;
      products: string[];
    };

    // Re-fetch from Redis to pick up any purchases made since token was issued
    // (e.g. user bought stress test after their blueprint token was created)
    const latestProducts: string[] = email
      ? await redis.smembers(`purchases:${email}`)
      : tokenProducts;

    return res.status(200).json({
      valid: true,
      products: latestProducts.length > 0 ? latestProducts : tokenProducts,
    });
  } catch {
    return res.status(401).json({ valid: false });
  }
}
