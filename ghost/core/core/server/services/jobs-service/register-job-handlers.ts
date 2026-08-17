import {getInstance} from './index';
import MediaInlinerJob from '../media-inliner/media-inliner-job';

export default function registerJobHandlers(): void {
    const jobsService = getInstance();
    const mediaInlinerService = require('../media-inliner');

    jobsService.handle(MediaInlinerJob, async (job: MediaInlinerJob) => {
        await mediaInlinerService.inline(job.domains);
    });
}
