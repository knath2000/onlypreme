import Stripe from "stripe";

export function createStripeClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return null;

  return new Stripe(secretKey, {
    apiVersion: "2026-04-22.dahlia"
  });
}

export function getStripeProPriceId() {
  return process.env.STRIPE_PRO_PRICE_ID || "price_1TS7iYBlEcaRurIYizBfYsJG";
}
