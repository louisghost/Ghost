import crypto from 'crypto';
const logging = require('@tryghost/logging');
const request = require('@tryghost/request');
const ghostVersion = require('@tryghost/version');
const errors = require('@tryghost/errors');
const config = require('../../../shared/config');

export type ExportComponents = {
    content: boolean;
    members: boolean;
    analytics: boolean;
    themes: boolean;
    routes: boolean;
    media: boolean;
};

type ExportRequestBody = {
    site_id: unknown;
    requested_by: string;
    components: ExportComponents;
};

type ExportRequestsServiceDependencies = {
    config: {
        get: (key: string) => unknown;
    };
    logging: {
        info: (message: string) => void;
        warn: (message: string) => void;
        error: (message: string) => void;
    };
    request: (url: string, options: unknown) => Promise<unknown>;
};

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRY_LIMIT = 5;

export class ExportRequestsService {
    #config: ExportRequestsServiceDependencies['config'];
    #logging: ExportRequestsServiceDependencies['logging'];
    #request: ExportRequestsServiceDependencies['request'];

    constructor(dependencies: ExportRequestsServiceDependencies = {config, logging, request}) {
        this.#config = dependencies.config;
        this.#logging = dependencies.logging;
        this.#request = dependencies.request;
    }

    #readExportRequestConfig() {
        return {
            generateArchiveUrl: this.#config.get('hostSettings:export:generate_archive_url'),
            // Deliberately NOT under hostSettings: the config output serializer
            // ships hostSettings wholesale to every staff session.
            webhookSecret: this.#config.get('exportRequests:webhookSecret'),
            siteId: this.#config.get('hostSettings:siteId')
        };
    }

    #computeSignature(timestamp: string, body: string, secret: string): string {
        const baseString = `${timestamp}:${body}`;
        return crypto.createHmac('sha256', secret).update(baseString).digest('base64');
    }

    #sanitizeUrl(url: string): string {
        try {
            return new URL(url).origin;
        } catch {
            return '[invalid archive url]';
        }
    }

    /**
     * Requests an async export archive from the configured host service.
     * The host service generates the archive in the background and emails a
     * download link to `requestedBy`.
     */
    async requestArchive({
        components,
        requestedBy
    }: {
        components: ExportComponents;
        requestedBy: string;
    }): Promise<void> {
        const {generateArchiveUrl, webhookSecret, siteId} = this.#readExportRequestConfig();

        if (typeof generateArchiveUrl !== 'string' || generateArchiveUrl.length === 0) {
            throw new errors.NotFoundError({
                message: 'Export archive generation is not enabled on this site'
            });
        }

        // The signed payload binds the delivery email, so never send it unsigned:
        // a missing secret while the URL is configured is a misconfiguration.
        if (typeof webhookSecret !== 'string' || webhookSecret.length === 0) {
            this.#logging.error('Export archive request is misconfigured: exportRequests:webhookSecret is missing while hostSettings:export:generate_archive_url is set.');
            throw new errors.IncorrectUsageError({
                message: 'Export requests are not configured correctly on this site'
            });
        }

        const payload: ExportRequestBody = {
            site_id: siteId,
            requested_by: requestedBy,
            components
        };

        const requestBody = JSON.stringify(payload);
        const timestamp = Date.now().toString();

        const headers: Record<string, string | number> = {
            'Content-Length': Buffer.byteLength(requestBody),
            'Content-Type': 'application/json',
            'Content-Version': `v${ghostVersion.safe}`,
            'X-Ghost-Request-Timestamp': timestamp,
            'X-Ghost-Signature': this.#computeSignature(timestamp, requestBody, webhookSecret)
        };

        const requestOptions = {
            method: 'POST',
            body: requestBody,
            headers,
            timeout: {
                request: REQUEST_TIMEOUT_MS
            },
            retry: {
                limit: process.env.NODE_ENV?.startsWith('test') ? 0 : MAX_RETRY_LIMIT
            }
        };

        const sanitizedUrl = this.#sanitizeUrl(generateArchiveUrl);
        this.#logging.info(`Requesting export archive generation from "${sanitizedUrl}"`);

        try {
            await this.#request(generateArchiveUrl, requestOptions);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.#logging.error(`Failed to request export archive generation from "${sanitizedUrl}": ${message}`);
            throw new errors.InternalServerError({
                statusCode: 502,
                message: 'Failed to start the export. Please try again later.'
            });
        }
    }
}

export const exportRequestsService = new ExportRequestsService();
