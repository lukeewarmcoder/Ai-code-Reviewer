import { Router, Request, Response } from "express";
import Stripe from "stripe";
import { getDb } from "../db/index.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";

// ─── Stripe client (lazy) ────────────────────────────────────────────────────

let _stripe: Stripe | null = null;

function getStripe(): Stripe {
    if (!_stripe) {
        _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
            apiVersion: "2026-02-25.clover",
        });
    }
    return _stripe;
}

const PRICE_ID = process.env.STRIPE_PRO_PRICE_ID ?? "";

// ─── Router ──────────────────────────────────────────────────────────────────

export const stripeRouter = Router();

// POST /checkout — create a Stripe Checkout Session for PRO subscription
stripeRouter.post("/checkout", async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.body as { userId?: string };

    if (!userId) {
        res.status(400).json({ success: false, error: { code: "MISSING_USER_ID", message: "userId is required." } });
        return;
    }

    try {
        const session = await getStripe().checkout.sessions.create({
            mode: "subscription",
            payment_method_types: ["card"],
            line_items: [{ price: PRICE_ID, quantity: 1 }],
            client_reference_id: userId,
            success_url: `${process.env.FRONTEND_URL ?? "http://localhost:3000"}/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.FRONTEND_URL ?? "http://localhost:3000"}/cancel`,
        });

        res.status(200).json({ success: true, url: session.url });
    } catch (err) {
        res.status(500).json({
            success: false,
            error: { code: "STRIPE_ERROR", message: err instanceof Error ? err.message : String(err) },
        });
    }
});

// POST /webhook — handle Stripe webhook events
stripeRouter.post("/webhook", async (req: Request, res: Response): Promise<void> => {
    const sig = req.headers["stripe-signature"] as string;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

    let event: Stripe.Event;
    try {
        event = getStripe().webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
        res.status(400).json({ error: `Webhook signature verification failed: ${err instanceof Error ? err.message : String(err)}` });
        return;
    }

    const db = getDb();

    switch (event.type) {
        case "checkout.session.completed": {
            const session = event.data.object as Stripe.Checkout.Session;
            const userId = session.client_reference_id;
            if (userId) {
                db.update(users)
                    .set({
                        plan: "PRO",
                        stripeCustomerId: session.customer as string,
                        stripeSubscriptionId: session.subscription as string,
                    })
                    .where(eq(users.id, userId))
                    .run();
            }
            break;
        }
        case "customer.subscription.deleted": {
            const subscription = event.data.object as Stripe.Subscription;
            const customerId = subscription.customer as string;
            db.update(users)
                .set({ plan: "FREE", stripeSubscriptionId: null })
                .where(eq(users.stripeCustomerId, customerId))
                .run();
            break;
        }
    }

    res.status(200).json({ received: true });
});
