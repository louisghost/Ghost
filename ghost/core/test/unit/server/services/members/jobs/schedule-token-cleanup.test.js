const assert = require('node:assert/strict');
const sinon = require('sinon');
const memberJobs = require('../../../../../../core/server/services/members/jobs');
const jobsService = require('../../../../../../core/server/services/jobs-service');
const adapterManager = require('../../../../../../core/server/services/adapter-manager').default;

describe('member jobs: token cleanup scheduling', function () {
    let scheduleStub;

    beforeEach(function () {
        jobsService.init();
        const backend = adapterManager.getAdapter('jobs');
        scheduleStub = sinon.stub(backend, 'scheduleRecurring');
    });

    afterEach(async function () {
        await jobsService.shutdown({timeoutMs: 100});
        sinon.restore();
    });

    it('does not schedule token cleanup under the test environment', async function () {
        await memberJobs.scheduleTokenCleanupJob();

        assert.ok(scheduleStub.notCalled, 'token cleanup must not be scheduled under NODE_ENV=test*');
    });

    it('schedules a daily clean-tokens job outside the test environment', async function () {
        const originalEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = 'production';
        try {
            await memberJobs.scheduleTokenCleanupJob();
        } finally {
            process.env.NODE_ENV = originalEnv;
        }

        assert.ok(scheduleStub.calledOnce, 'clean-tokens is scheduled outside the test environment');
        const [envelope, schedule] = scheduleStub.firstCall.args;
        assert.equal(envelope.type, 'clean-tokens');
        assert.match(schedule.cron, /^\d+ \d+ \d+ \* \* \*$/, 'a random daily 6-field cron');
    });
});
