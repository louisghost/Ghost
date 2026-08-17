import {CUSTOM_FIELD_SET_OPERATORS, customFieldAddressing} from './custom-field-addressing';
import {FILTER_TYPES, type FieldDescriptor, type OperatorId, buildCatalogue, columnAddressing, withFutureRelativeOperator, withPastRelativeOperator} from '@/shared/filters';
import {NEWSLETTER_FIELD} from './newsletter-filter-fields';
import {feedbackSemantics, subscriptionSemantics} from './member-value-semantics';
import {MULTIPLE_ACTIVE_STRIPE_CUSTOMERS_FIELD} from './multiple-active-subscriptions';

const SUBSCRIPTION_STATUS_OPTIONS: Array<{value: string; label: string}> = [
    {value: 'active', label: 'Active'},
    {value: 'trialing', label: 'Trialing'},
    {value: 'canceled', label: 'Canceled'},
    {value: 'unpaid', label: 'Unpaid'},
    {value: 'past_due', label: 'Past Due'},
    {value: 'incomplete', label: 'Incomplete'},
    {value: 'incomplete_expired', label: 'Incomplete - Expired'}
];

// Ordinary text comparison, reached through the custom fields relation rather than a
// column. Neither half is written here: the grammar is in custom-field-addressing.ts and
// the vocabulary is the same one member name and email use.

const MEMBER_FIELDS: FieldDescriptor[] = [
    {key: 'name', type: 'text', ui: {label: 'Name', placeholder: 'Enter name...', className: 'w-48'}},
    {key: 'email', type: 'text', ui: {label: 'Email', placeholder: 'Enter email...', className: 'w-48'}},
    {key: 'label', type: 'set', ui: {label: 'Label', searchable: true, className: 'w-64'},
        metadata: {activeColumn: {key: 'labels', label: 'Labels', include: 'labels'}}},
    {key: 'subscribed', semantics: subscriptionSemantics(), operators: FILTER_TYPES.scalar.operators,
        ui: {label: 'Newsletter subscription', type: 'select', searchable: false},
        options: [
            {value: 'subscribed', label: 'Subscribed'},
            {value: 'unsubscribed', label: 'Unsubscribed'},
            {value: 'email-disabled', label: 'Email disabled'}
        ]},
    {key: 'last_seen_at', type: 'timestamp', ui: {label: 'Last seen'}},
    {key: 'created_at', type: 'timestamp', ui: {label: 'Created'}},
    {key: 'signup', type: 'scalar', valueConfig: {quoteStrings: true},
        ui: {label: 'Signed up on post/page', searchable: true, placeholder: 'Select a post or page...', className: 'w-64'}},
    {key: 'tier_id', type: 'set', ui: {label: 'Membership tier', searchable: true, className: 'w-64'},
        metadata: {activeColumn: {key: 'tiers', label: 'Tiers', include: 'tiers'}}},
    {key: 'status', type: 'scalar', ui: {label: 'Member status', searchable: false},
        options: [
            {value: 'paid', label: 'Paid'},
            {value: 'free', label: 'Free'},
            {value: 'comped', label: 'Complimentary'}
        ]},
    {key: 'subscriptions.plan_interval', type: 'scalar', ui: {label: 'Billing period', searchable: false},
        options: [
            {value: 'month', label: 'Monthly'},
            {value: 'year', label: 'Yearly'}
        ],
        metadata: {activeColumn: {key: 'subscriptions.plan_interval', label: 'Billing period', include: 'subscriptions'}}},
    {key: 'subscriptions.status', type: 'scalar', ui: {label: 'Stripe subscription status', searchable: false},
        options: SUBSCRIPTION_STATUS_OPTIONS,
        metadata: {activeColumn: {key: 'subscriptions.status', label: 'Subscription status', include: 'subscriptions'}}},
    {key: 'subscriptions.start_date', type: 'timestamp', ui: {label: 'Paid start date'},
        metadata: {activeColumn: {key: 'subscriptions.start_date', label: 'Paid start date', include: 'subscriptions'}}},
    {key: 'subscriptions.current_period_end', type: 'timestamp', ui: {label: 'Next billing date'},
        metadata: {activeColumn: {key: 'subscriptions.current_period_end', label: 'Next billing date', include: 'subscriptions'}}},
    {key: 'conversion', type: 'scalar', valueConfig: {quoteStrings: true},
        ui: {label: 'Subscription started on post/page', searchable: true, placeholder: 'Select a post or page...', className: 'w-64'}},
    {key: 'email_count', type: 'number', ui: {label: 'Emails sent (all time)', defaultOperator: 'is-greater', min: 0, className: 'w-24'}},
    {key: 'email_opened_count', type: 'number', ui: {label: 'Emails opened (all time)', defaultOperator: 'is-greater', min: 0, className: 'w-24'}},
    {key: 'email_open_rate', type: 'number', ui: {label: 'Open rate (all time)', defaultOperator: 'is-greater', min: 0, max: 100, suffix: '%', className: 'w-24'}},
    {key: 'emails.post_id', type: 'scalar', valueConfig: {quoteStrings: true},
        ui: {label: 'Sent email', searchable: true, placeholder: 'Select an email...', className: 'w-64'}},
    {key: 'opened_emails.post_id', type: 'scalar', valueConfig: {quoteStrings: true},
        ui: {label: 'Opened email', searchable: true, placeholder: 'Select an email...', className: 'w-64'}},
    {key: 'clicked_links.post_id', type: 'scalar', valueConfig: {quoteStrings: true},
        ui: {label: 'Clicked email', searchable: true, placeholder: 'Select an email...', className: 'w-64'}},
    {key: 'newsletter_feedback', semantics: feedbackSemantics(), addressing: columnAddressing({field: 'feedback.post_id'}), operators: ['1', '0'],
        ui: {label: 'Responded with feedback', type: 'select', searchable: true, placeholder: 'Select an email...', className: 'w-64', defaultOperator: '1'}},
    {key: 'offer_redemptions', type: 'set', valueConfig: {quoteStrings: true, serializeSingletonAsScalar: true},
        ui: {label: 'Offer', searchable: true, className: 'w-64'},
        metadata: {activeColumn: {key: 'offer_redemptions', label: 'Offer'}}},
    // The same yes-or-no-over-a-count as a comment's "reported", at a different threshold and
    // writing its negative differently — both of which are this field's to configure.
    {key: MULTIPLE_ACTIVE_STRIPE_CUSTOMERS_FIELD, type: 'count', valueConfig: {threshold: 1, absentForm: 'below'},
        ui: {label: 'Multiple active subscriptions', type: 'select', searchable: false, hideOperatorSelect: true},
        options: [
            {value: 'true', label: 'Yes'},
            {value: 'false', label: 'No'}
        ]}
];

// The relative operators are a property of the field rather than of the timestamp type:
// only some dates are worth asking "in the last 30 days" of, and only some "in the next".
const RELATIVE_PAST_FIELDS = ['last_seen_at', 'created_at', 'subscriptions.start_date'];
const RELATIVE_FUTURE_FIELDS = ['subscriptions.current_period_end'];

function withRelativeOperators(descriptor: FieldDescriptor): FieldDescriptor {
    if (RELATIVE_PAST_FIELDS.includes(descriptor.key)) {
        return withPastRelativeOperator(descriptor);
    }

    if (RELATIVE_FUTURE_FIELDS.includes(descriptor.key)) {
        return withFutureRelativeOperator(descriptor);
    }

    return descriptor;
}

/**
 * A custom field, whatever its key. The key is a parameter, so one entry answers for every
 * field a publisher has defined and a filter naming one can be read without fetching the
 * definitions first — including a key this build has never heard of, which reads as text
 * rather than being dropped.
 */
/**
 * A custom text field's operators: the equality pair and the text matches its vocabulary
 * expresses, then the presence pair its addressing adds. Derived from the same lists the
 * column-backed fields use, so the members filter keeps one vocabulary.
 */
export const CUSTOM_FIELD_OPERATORS: readonly OperatorId[] = [...FILTER_TYPES.text.operators, ...CUSTOM_FIELD_SET_OPERATORS];

const CUSTOM_FIELD: FieldDescriptor = {
    key: 'custom_field.:key',
    type: 'text',
    addressing: customFieldAddressing(),
    operators: CUSTOM_FIELD_OPERATORS,
    ui: {
        label: 'Custom field',
        type: 'custom',
        component: 'custom-field'
    }
};

/**
 * Every field Ghost itself declares, including the two parameterised entries that answer for
 * any newsletter and any custom field. A site's own definitions layer more precise entries
 * over these — see member-filter-catalogue.ts — but these alone can read any filter.
 */
export const MEMBER_FIELD_DESCRIPTORS: FieldDescriptor[] = [
    ...MEMBER_FIELDS.map(withRelativeOperators),
    NEWSLETTER_FIELD,
    CUSTOM_FIELD
];

export const memberFields = buildCatalogue(MEMBER_FIELD_DESCRIPTORS);

export type MemberFields = typeof memberFields;

export function getMemberFields(): MemberFields {
    return memberFields;
}
