import Stripe from 'stripe';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.resolve(__dirname, '../helpers/services/stripe/fixtures');

// Pinned to what ghost/core ships. Response shapes are version-dependent, so a
// fixture captured at any other version would describe an API we do not call.
const API_VERSION = '2020-08-27';
const PRODUCT_NAME = 'E2E Fixture Tier';

function log(message: string): void {
    process.stdout.write(`${message}\n`);
}

/**
 * Strips whatever identifies the account a fixture was captured from. These files are
 * committed and read by everyone, and a capture otherwise carries the operator's Stripe
 * account display name and payment-method-configuration id into the repository.
 *
 * Applied here rather than by hand after capture, so re-capturing cannot quietly undo it.
 */
function sanitize(json: string): string {
    return json
        .replace(/"display_name": "[^"]*"/g, '"display_name": "Example Publication"')
        .replace(/"pmc_[A-Za-z0-9]+"/g, '"pmc_000000000000000000000000"');
}

function save<T extends object>(name: string, object: T): T {
    const json = sanitize(`${JSON.stringify(object, null, 2)}\n`);
    fs.writeFileSync(path.resolve(fixtureDir, `${name}.json`), json);
    log(`  ${name} (${Object.keys(object).length} keys)`);
    return object;
}

const secretKey = process.env.STRIPE_SECRET_KEY;
if (!secretKey || !secretKey.startsWith('sk_test_')) {
    log('STRIPE_SECRET_KEY must be set to a test-mode key (sk_test_...).');
    log('Fixtures are captured against Stripe test mode only; a live key is refused.');
    process.exit(1);
}

const stripe = new Stripe(secretKey, {apiVersion: API_VERSION});

/**
 * Stripe cannot delete a product that has prices, so re-running this would otherwise
 * leave a trail of near-identical products in the account. Reuse ours if it exists.
 */
async function findOrCreateProduct(): Promise<Stripe.Product> {
    const existing = await stripe.products.list({limit: 100, active: true});
    const found = existing.data.find(product => product.name === PRODUCT_NAME);
    if (found) {
        log(`Reusing product ${found.id}`);
        return found;
    }
    log('Creating product');
    // Ghost sends only a name: see product-repository.js createProduct call.
    return stripe.products.create({name: PRODUCT_NAME});
}

async function findOrCreatePrice(
    product: Stripe.Product,
    {nickname, amount, interval}: {nickname: string; amount: number; interval: 'month' | 'year'}
): Promise<Stripe.Price> {
    const existing = await stripe.prices.list({product: product.id, limit: 100});
    const found = existing.data.find(price => price.nickname === nickname);
    if (found) {
        return found;
    }
    // Mirrors product-repository.js, which is what makes these fixtures Ghost-shaped
    // rather than merely valid: the nicknames are what member-repository matches on.
    return stripe.prices.create({
        product: product.id,
        active: true,
        nickname,
        currency: 'usd',
        unit_amount: amount,
        recurring: {interval}
    });
}

async function main(): Promise<void> {
    fs.mkdirSync(fixtureDir, {recursive: true});
    log(`Capturing against Stripe test mode at API version ${API_VERSION}\n`);

    const product = save('product', await findOrCreateProduct());
    const monthly = save('price.monthly', await findOrCreatePrice(product, {nickname: 'Monthly', amount: 500, interval: 'month'}));
    save('price.yearly', await findOrCreatePrice(product, {nickname: 'Yearly', amount: 5000, interval: 'year'}));
    const complimentary = save('price.complimentary', await findOrCreatePrice(product, {nickname: 'Complimentary', amount: 0, interval: 'year'}));

    save('coupon', await stripe.coupons.create({percent_off: 10, duration: 'once', name: 'Fixture coupon'}));

    const customer = save('customer', await stripe.customers.create({
        email: `fixture-${Date.now()}@example.com`,
        name: 'Fixture Customer'
    }));
    const paymentMethod = save('payment_method', await stripe.paymentMethods.attach('pm_card_visa', {customer: customer.id}));
    await stripe.customers.update(customer.id, {invoice_settings: {default_payment_method: paymentMethod.id}});

    save('subscription.paid', await stripe.subscriptions.create({
        customer: customer.id,
        items: [{price: monthly.id}],
        default_payment_method: paymentMethod.id
    }));
    // The comped shape. member-repository decides a member is comped by matching
    // plan.nickname against 'Complimentary', so this fixture is what that check reads.
    save('subscription.complimentary', await stripe.subscriptions.create({
        customer: customer.id,
        items: [{price: complimentary.id}]
    }));

    const urls = {success_url: 'https://example.com/success', cancel_url: 'https://example.com/cancel'};
    save('checkout_session.subscription', await stripe.checkout.sessions.create({
        ...urls,
        mode: 'subscription',
        line_items: [{price: monthly.id, quantity: 1}]
    }));
    save('checkout_session.shipping', await stripe.checkout.sessions.create({
        ...urls,
        mode: 'subscription',
        line_items: [{price: monthly.id, quantity: 1}],
        shipping_address_collection: {allowed_countries: ['GB', 'US']}
    }));
    save('checkout_session.donation', await stripe.checkout.sessions.create({
        ...urls,
        mode: 'payment',
        submit_type: 'donate',
        line_items: [{price_data: {currency: 'usd', unit_amount: 1000, product: product.id}, quantity: 1}],
        custom_fields: [{
            key: 'donation_message',
            label: {type: 'custom', custom: 'Add a personal note'},
            type: 'text',
            optional: true
        }]
    }));

    // Without this there is no way to tell how stale the fixtures are, which makes
    // the "fixtures go stale" trade-off unmeasurable rather than merely accepted.
    save('manifest', {
        captured_at: new Date().toISOString(),
        api_version: API_VERSION,
        stripe_node: process.env.npm_package_dependencies_stripe ?? 'see e2e/package.json',
        note: 'Regenerate with `pnpm stripe:fixtures`. Completed checkout is captured separately by hand.'
    });

    log('\nDone. A completed checkout cannot be captured here: Stripe blocks automating');
    log('its hosted page, so checkout_session.completed must be captured by hand.');
}

main().catch((error: Error) => {
    log(`Capture failed: ${error.message}`);
    process.exit(1);
});
