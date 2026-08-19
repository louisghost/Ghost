const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const nock = require('nock');
const {agentProvider, fixtureManager} = require('../../utils/e2e-framework');
const configUtils = require('../../utils/config-utils');

const ARCHIVE_ORIGIN = 'https://archive-generator.example.com';
const ARCHIVE_PATH = '/api/generate/';
const WEBHOOK_SECRET = 'test-export-webhook-secret';
const SITE_ID = 'test-site-id';

const ALL_COMPONENTS = {
    content: true,
    members: true,
    analytics: true,
    themes: true,
    routes: true,
    media: false
};

function configureArchiveHost() {
    configUtils.set('hostSettings:export:generate_archive_url', `${ARCHIVE_ORIGIN}${ARCHIVE_PATH}`);
    configUtils.set('hostSettings:siteId', SITE_ID);
    configUtils.set('exportRequests:webhookSecret', WEBHOOK_SECRET);
}

function mockArchiveHost({status = 202} = {}) {
    const captured = {};

    nock(ARCHIVE_ORIGIN)
        .post(ARCHIVE_PATH)
        .reply(function (uri, requestBody) {
            captured.headers = this.req.headers;
            captured.body = requestBody;
            return [status, {}];
        });

    return captured;
}

describe('Exports API', function () {
    let agent;

    beforeAll(async function () {
        agent = await agentProvider.getAdminAPIAgent();
        await fixtureManager.init('users');
    });

    afterEach(async function () {
        nock.cleanAll();
        await configUtils.restore();
    });

    describe('As Unauthorized User', function () {
        it('Cannot request an export', async function () {
            configureArchiveHost();

            await agent
                .post('/exports/requests/')
                .body({components: ALL_COMPONENTS})
                .expectStatus(403);
        });
    });

    describe('As Owner', function () {
        beforeAll(async function () {
            await agent.loginAsOwner();
        });

        it('Can request an export and sends a signed request to the archive host', async function () {
            configureArchiveHost();
            const captured = mockArchiveHost();

            await agent
                .post('/exports/requests/')
                .body({components: {content: true, members: true, media: true}})
                .expectStatus(202);

            assert.ok(captured.body, 'Expected an outbound request to the archive host');

            // Body shape: site_id passed through as-is, requested_by resolved
            // server-side, components normalized to the full 6-key object
            assert.deepEqual(captured.body, {
                site_id: SITE_ID,
                requested_by: fixtureManager.get('users', 0).email,
                components: {
                    content: true,
                    members: true,
                    analytics: false,
                    themes: false,
                    routes: false,
                    media: true
                }
            });

            assert.equal(captured.headers['content-type'], 'application/json');
            assert.match(captured.headers['content-version'], /^v\d+\.\d+$/);

            const timestamp = captured.headers['x-ghost-request-timestamp'];
            assert.match(timestamp, /^\d+$/);

            // nock hands us the parsed body; the service signs the raw
            // JSON.stringify output, which re-stringifying reproduces exactly
            const rawBody = JSON.stringify(captured.body);
            assert.equal(captured.headers['content-length'], `${Buffer.byteLength(rawBody)}`);

            const expectedSignature = crypto
                .createHmac('sha256', WEBHOOK_SECRET)
                .update(`${timestamp}:${rawBody}`)
                .digest('base64');

            assert.equal(captured.headers['x-ghost-signature'], expectedSignature);
        });

        it('Ignores an email supplied in the request body', async function () {
            configureArchiveHost();
            const captured = mockArchiveHost();

            await agent
                .post('/exports/requests/')
                .body({components: {content: true}, requested_by: 'attacker@example.com'})
                .expectStatus(202);

            assert.equal(captured.body.requested_by, fixtureManager.get('users', 0).email);
        });

        it('Returns 404 when no archive host is configured', async function () {
            await agent
                .post('/exports/requests/')
                .body({components: ALL_COMPONENTS})
                .expectStatus(404);
        });

        it('Refuses to send an unsigned request when the secret is missing while the archive host is configured', async function () {
            configUtils.set('hostSettings:export:generate_archive_url', `${ARCHIVE_ORIGIN}${ARCHIVE_PATH}`);
            configUtils.set('hostSettings:siteId', SITE_ID);

            // IncorrectUsageError → 400; crucially, no outbound request is made
            // (nothing is mocked here, so an attempt would fail the test)
            await agent
                .post('/exports/requests/')
                .body({components: ALL_COMPONENTS})
                .expectStatus(400);
        });

        it('Returns 502 when the archive host rejects the request', async function () {
            configureArchiveHost();
            mockArchiveHost({status: 500});

            await agent
                .post('/exports/requests/')
                .body({components: ALL_COMPONENTS})
                .expectStatus(502);
        });

        it('Returns 400 when components is missing', async function () {
            configureArchiveHost();

            await agent
                .post('/exports/requests/')
                .body({})
                .expectStatus(400);
        });

        it('Returns 400 when components contains unknown keys', async function () {
            configureArchiveHost();

            await agent
                .post('/exports/requests/')
                .body({components: {content: true, database: true}})
                .expectStatus(400);
        });

        it('Returns 400 when component values are not booleans', async function () {
            configureArchiveHost();

            await agent
                .post('/exports/requests/')
                .body({components: {content: 'yes'}})
                .expectStatus(400);
        });

        it('Returns 400 when no component is selected', async function () {
            configureArchiveHost();

            await agent
                .post('/exports/requests/')
                .body({components: {content: false, members: false}})
                .expectStatus(400);
        });
    });

    describe('As Editor', function () {
        beforeAll(async function () {
            await agent.loginAsEditor();
        });

        it('Cannot request an export', async function () {
            configureArchiveHost();

            await agent
                .post('/exports/requests/')
                .body({components: ALL_COMPONENTS})
                .expectStatus(403);
        });
    });

    describe('As Author', function () {
        beforeAll(async function () {
            await agent.loginAsAuthor();
        });

        it('Cannot request an export', async function () {
            configureArchiveHost();

            await agent
                .post('/exports/requests/')
                .body({components: ALL_COMPONENTS})
                .expectStatus(403);
        });
    });
});
