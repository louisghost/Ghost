import {columnAddressing, withPastRelativeOperator} from '@/shared/filters';
import type {FieldDescriptor} from '@/shared/filters';

// The fields a comment can be filtered by.
//
// The same shape members uses: a key, a label, a type, and where the value lives. Comments has
// no runtime-defined fields, so its one provider is always resolved — which is the only way it
// differs from a newsletter or a custom field.

const COMMENT_FIELDS: FieldDescriptor[] = [
    {
        key: 'status',
        type: 'scalar',
        operators: ['is'],
        options: [
            {value: 'published', label: 'Published'},
            {value: 'hidden', label: 'Hidden'}
        ],
        ui: {label: 'Status', searchable: false, hideOperatorSelect: true}
    },
    withPastRelativeOperator({
        key: 'created_at',
        type: 'timestamp',
        ui: {label: 'Date'}
    }),
    {
        key: 'body',
        type: 'text',
        operators: ['contains', 'does-not-contain'],
        // The predicate is keyed `body`, but the column holding the text is `html`.
        addressing: columnAddressing({field: 'html'}),
        parseKeys: ['html'],
        ui: {
            label: 'Text',
            placeholder: 'Search comment text...',
            className: 'w-full max-w-48',
            popoverContentClassName: 'w-full max-w-48'
        }
    },
    {
        key: 'post',
        type: 'scalar',
        operators: ['is', 'is-not'],
        addressing: columnAddressing({field: 'post_id'}),
        parseKeys: ['post_id'],
        ui: {
            label: 'Post',
            searchable: true,
            className: 'w-full max-w-80',
            popoverContentClassName: 'w-full max-w-[calc(100vw-32px)] max-w-80'
        }
    },
    {
        key: 'author',
        type: 'scalar',
        operators: ['is', 'is-not'],
        addressing: columnAddressing({field: 'member_id'}),
        parseKeys: ['member_id'],
        ui: {
            label: 'Author',
            searchable: true,
            className: 'w-80',
            popoverContentClassName: 'w-80'
        }
    },
    {
        key: 'reported',
        // A yes or no stored as a count: any reports at all is yes, exactly none is no.
        type: 'count',
        valueConfig: {threshold: 0, absentForm: 'equals'},
        addressing: columnAddressing({field: 'count.reports'}),
        parseKeys: ['count.reports'],
        options: [
            {value: 'true', label: 'Yes'},
            {value: 'false', label: 'No'}
        ],
        ui: {label: 'Reported', type: 'select', searchable: false, hideOperatorSelect: true}
    }
];

export {COMMENT_FIELDS};
