import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createStripeClient, getStripeProPriceId } from "@/lib/stripe";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return NextResponse.redirect(new URL("/login", request.url), 303);
  }

  const stripe = createStripeClient();
  if (!stripe) {
    return NextResponse.json({ error: "Stripe is not configured." }, { status: 503 });
  }

  const origin = new URL(request.url).origin;
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [
      {
        price: getStripeProPriceId(),
        quantity: 1
      }
    ],
    customer_email: data.user.email ?? undefined,
    client_reference_id: data.user.id,
    success_url: `${origin}/?checkout=success`,
    cancel_url: `${origin}/?checkout=cancelled`,
    metadata: {
      userId: data.user.id
    },
    subscription_data: {
      metadata: {
        userId: data.user.id
      }
    }
  });

  if (!session.url) {
    return NextResponse.json({ error: "Unable to create checkout session." }, { status: 500 });
  }

  return NextResponse.redirect(session.url, 303);
}
