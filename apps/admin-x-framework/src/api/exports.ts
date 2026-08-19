import {createMutation} from '../utils/api/hooks';

export type ExportComponents = {
    content?: boolean;
    members?: boolean;
    analytics?: boolean;
    themes?: boolean;
    routes?: boolean;
    media?: boolean;
};

export type ExportRequestPayload = {
    components: ExportComponents;
};

export const useRequestExport = createMutation<unknown, ExportRequestPayload>({
    method: 'POST',
    path: () => '/exports/requests/',
    body: ({components}) => ({components})
});
