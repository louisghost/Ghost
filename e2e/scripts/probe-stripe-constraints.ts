import Stripe from 'stripe';

/**
 * Measures the checkout constraints the fake Stripe server enforces.
 *
 * The limits in `fake-stripe-server.ts` cannot be taken from Stripe's docs or its
 * published OpenAPI spec, because both disagree with the API: the spec carries no
 * `maxItems` on `custom_fields`, states the `customer_update` rule only in prose,
 * and marks `allowed_countries` required when the API does not. This script is how
 * those limits were established, and how to re-establish them when Stripe moves one.
 *
 * Run: STRIPE_SECRET_KEY=sk_test_... pnpm --filter @tryghost/e2e stripe:probe
 */

const API_VERSION = '2020-08-27';

function log(message: string): void {
    process.stdout.write(`${message}\n`);
}

const secretKey = process.env.STRIPE_SECRET_KEY;
if (!secretKey || !secretKey.startsWith('sk_test_')) {
    log('STRIPE_SECRET_KEY must be set to a test-mode key (sk_test_...).');
    process.exit(1);
}

const stripe = new Stripe(secretKey, {apiVersion: API_VERSION});

const field = (overrides: Record<string, unknown> = {}) => ({
    key: 'probe',
    label: {type: 'custom' as const, custom: 'Probe'},
    type: 'text' as const,
    ...overrides
});

async function probe(name: string, params: Record<string, unknown>): Promise<void> {
    try {
        await stripe.checkout.sessions.create(params as Stripe.Checkout.SessionCreateParams);
        log(`  ACCEPTED  ${name}`);
    } catch (error) {
        log(`  REJECTED  ${name}`);
        log(`            ${(error as Error).message}`);
    }
}

async function main(): Promise<void> {
    const prices = await stripe.prices.list({limit: 100});
    const monthly = prices.data.find(price => price.nickname === 'Monthly' && price.active);
    if (!monthly) {
        log('No "Monthly" price found. Run `pnpm stripe:fixtures` first to provision one.');
        process.exit(1);
    }

    const base = {
        mode: 'subscription',
        line_items: [{price: monthly.id, quantity: 1}],
        success_url: 'https://example.com/success',
        cancel_url: 'https://example.com/cancel'
    };

    log(`Probing Stripe test mode at API version ${API_VERSION}\n`);
    await probe('label at 50 characters', {...base, custom_fields: [field({label: {type: 'custom', custom: 'a'.repeat(50)}})]});
    await probe('label at 51 characters', {...base, custom_fields: [field({label: {type: 'custom', custom: 'a'.repeat(51)}})]});
    await probe('three custom fields', {...base, custom_fields: [1, 2, 3].map(n => field({key: `probe_${n}`}))});
    await probe('four custom fields', {...base, custom_fields: [1, 2, 3, 4].map(n => field({key: `probe_${n}`}))});
    await probe('underscore in key', {...base, custom_fields: [field({key: 'probe_key_name'})]});
    await probe('customer_update without customer', {...base, customer_update: {address: 'auto'}});
    await probe('shipping_address_collection without allowed_countries', {...base, shipping_address_collection: {}});

    log('\nEach REJECTED message is the string the fake server should return.');
}

main().catch((error: Error) => {
    log(`Probe failed: ${error.message}`);
    process.exit(1);
});
