// Stripe → Wingman. Activates a seat when someone pays, moves them up the loyalty ladder on every
// weekly renewal (and re-prices their subscription), and pauses the seat when the subscription ends.
//
// Deploy:  supabase functions deploy stripe-webhook --no-verify-jwt
// Secrets: supabase secrets set STRIPE_SECRET_KEY=sk_live_... STRIPE_WEBHOOK_SECRET=whsec_... \
//            PRICE_WEEK1=price_... PRICE_WEEK2=price_... PRICE_WEEK3=price_... PRICE_WEEK4=price_...
// (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided to edge functions automatically.)
// Stripe → Developers → Webhooks → add endpoint https://<project>.supabase.co/functions/v1/stripe-webhook
//   events: checkout.session.completed, invoice.paid, customer.subscription.deleted, invoice.payment_failed
import Stripe from "https://esm.sh/stripe@14.21.0?target=denonext";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});
const cryptoProvider = Stripe.createSubtleCryptoProvider();
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

// Loyalty ladder: week 1 $200 → week 2 $180 → week 3 $160 → week 4+ $140 (+20 points per renewal from week 4)
const PRICES = [1, 2, 3, 4].map((n) => Deno.env.get(`PRICE_WEEK${n}`) || "");
const priceForWeek = (week: number) => PRICES[Math.min(Math.max(week, 1), 4) - 1];

async function setNextPrice(subscriptionId: string, nextWeek: number) {
  const price = priceForWeek(nextWeek);
  if (!price) return; // price ids not configured: skip repricing
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  const item = sub.items.data[0];
  if (!item || item.price.id === price) return;
  await stripe.subscriptions.update(subscriptionId, {
    items: [{ id: item.id, price }],
    proration_behavior: "none",
  });
}

Deno.serve(async (req) => {
  const sig = req.headers.get("stripe-signature");
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body, sig ?? "", Deno.env.get("STRIPE_WEBHOOK_SECRET")!, undefined, cryptoProvider,
    );
  } catch (_e) {
    return new Response("invalid signature", { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object as Stripe.Checkout.Session;
        if (s.mode !== "subscription" || !s.client_reference_id) break; // day pass / ebook: nothing to activate
        await db.from("roster").update({
          status: "active", week: 1,
          stripe_customer_id: s.customer as string,
          stripe_subscription_id: s.subscription as string,
          cancel_requested: false,
        }).eq("user_id", s.client_reference_id);
        if (s.subscription) await setNextPrice(s.subscription as string, 2);
        break;
      }
      case "invoice.paid": {
        const inv = event.data.object as Stripe.Invoice;
        if (inv.billing_reason !== "subscription_cycle" || !inv.subscription) break; // first invoice is handled above
        const { data: row } = await db.from("roster").select("user_id,week,points")
          .eq("stripe_subscription_id", inv.subscription as string).maybeSingle();
        if (!row) break;
        const week = row.week + 1;
        await db.from("roster").update({
          week, status: "active", points: row.points + (week >= 4 ? 20 : 0),
        }).eq("user_id", row.user_id);
        await setNextPrice(inv.subscription as string, week + 1);
        break;
      }
      case "invoice.payment_failed":
      case "customer.subscription.deleted": {
        const o = event.data.object as { subscription?: string; id?: string; object: string };
        const subId = o.object === "subscription" ? o.id : o.subscription;
        if (subId) await db.from("roster").update({ status: "paused" }).eq("stripe_subscription_id", subId);
        break;
      }
    }
  } catch (e) {
    console.error("webhook handler error", e);
    return new Response("handler error", { status: 500 }); // Stripe will retry
  }
  return new Response("ok", { status: 200 });
});
