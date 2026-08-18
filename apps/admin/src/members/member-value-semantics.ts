import {escapeNqlString} from '@tryghost/nql-string';
import type {ClauseGroup, SemanticValue, SerializedValue, ValueSemantics} from '@/shared/filters';

// Vocabularies whose values span more than one clause.
//
// Each of these was a hand-written codec, because a value used to be one expression on one key
// and these are not: whether a member is subscribed is a statement about a flag and a column at
// once, and a feedback score is carried by the operator rather than the value. They are
// ordinary vocabularies now — a field names one and configures it, and everything else about
// the field comes from the same machinery every other field uses.

const EMAIL_DISABLED = 'email_disabled';

function clauseFor(group: ClauseGroup, key: string) {
    return group.clauses.find(clause => clause.key === key);
}

export type SubscriptionOperator = 'is' | 'is-not';

/**
 * Whether a member takes email at all.
 *
 * Three answers over two columns: `subscribed` says whether they opted in, `email_disabled`
 * says whether Ghost has stopped sending. "Email disabled" is a statement about the second
 * alone, which is why it writes one clause where the others write two.
 */
export function subscriptionSemantics(): ValueSemantics<SubscriptionOperator> {
    return {
        operators: ['is', 'is-not'],
        serialize({operator, values}): SerializedValue | null {
            const value = values[0];
            const affirmative = operator === 'is';

            if (operator !== 'is' && operator !== 'is-not') {
                return null;
            }

            if (value === 'email-disabled') {
                return {fragments: [{key: EMAIL_DISABLED, expression: affirmative ? '1' : '0'}]};
            }

            if (value !== 'subscribed' && value !== 'unsubscribed') {
                return null;
            }

            const optedIn = value === 'subscribed';

            // Asking for a state means both things hold; denying it means either fails, which
            // is why the negative joins with `,` rather than `+`.
            return affirmative
                ? {join: 'and', fragments: [{expression: String(optedIn)}, {key: EMAIL_DISABLED, expression: '0'}]}
                : {join: 'or', fragments: [{expression: String(!optedIn)}, {key: EMAIL_DISABLED, expression: '1'}]};
        },
        parse() {
            return null;
        },
        parseClauses(group): SemanticValue<SubscriptionOperator> | null {
            const disabled = clauseFor(group, EMAIL_DISABLED);
            const subscribed = clauseFor(group, 'subscribed');

            if (disabled && !subscribed && group.clauses.length === 1) {
                if (disabled.value === 1) {
                    return {operator: 'is', values: ['email-disabled']};
                }

                if (disabled.value === 0) {
                    return {operator: 'is-not', values: ['email-disabled']};
                }

                return null;
            }

            if (!subscribed || typeof subscribed.value !== 'boolean') {
                return null;
            }

            // A lone `subscribed:true` is the shape Ember wrote before email_disabled existed.
            // Read on its own it still means opted in, and canonicalises to the pair on save.
            if (!disabled && group.clauses.length === 1) {
                return {operator: 'is', values: [subscribed.value ? 'subscribed' : 'unsubscribed']};
            }

            if (!disabled) {
                return null;
            }

            // The pair means the pair and nothing else. A flat group carrying a third clause —
            // which is how `subscribed:true+email_disabled:0+name:~'x'` parses, ungrouped — is
            // not this value, and claiming it would drop everything the group also said.
            if (group.clauses.length !== 2) {
                return null;
            }

            if (group.join === 'and' && disabled.value === 0) {
                return {operator: 'is', values: [subscribed.value ? 'subscribed' : 'unsubscribed']};
            }

            if (group.join === 'or' && disabled.value === 1) {
                return {operator: 'is-not', values: [subscribed.value ? 'unsubscribed' : 'subscribed']};
            }

            return null;
        }
    };
}

export type FeedbackOperator = '1' | '0';

/**
 * A member's response to an email.
 *
 * The operator is the score — "more like this" is the operator `1` — so the value names the
 * post and the operator names what was said about it.
 */
export function feedbackSemantics(): ValueSemantics<FeedbackOperator> {
    return {
        operators: ['1', '0'],
        serialize({operator, values}): SerializedValue | null {
            const postId = values[0];

            if (typeof postId !== 'string' || !postId) {
                return null;
            }

            return {
                join: 'and',
                fragments: [
                    {expression: escapeNqlString(postId)},
                    {key: 'feedback.score', expression: operator}
                ]
            };
        },
        parse() {
            return null;
        },
        parseClauses(group): SemanticValue<FeedbackOperator> | null {
            const post = clauseFor(group, 'feedback.post_id');
            const score = clauseFor(group, 'feedback.score');

            // As above: exactly the two clauses, or this is not a feedback value and the rest of
            // the group would be discarded with it.
            if (group.clauses.length !== 2 || group.join !== 'and' || !post || !score || typeof post.value !== 'string') {
                return null;
            }

            if (score.value !== 0 && score.value !== 1) {
                return null;
            }

            return {operator: score.value === 1 ? '1' : '0', values: [post.value]};
        }
    };
}
