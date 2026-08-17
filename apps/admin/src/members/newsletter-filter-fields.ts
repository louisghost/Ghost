import {getCompoundChildren, readNegatedString} from '@/shared/filters';
import type {AstNode, CompoundMatch, FieldAddressing, FieldDescriptor, FieldProvider, SemanticValue, SerializedValue, ValueSemantics} from '@/shared/filters';

// Whether a member takes one newsletter.
//
// One entry serves every newsletter: the slug is a parameter of the field's key
// (`newsletters.:slug`), so a site with two newsletters and a site with two hundred need the
// same single declaration, and a filter can be read without fetching anything first.
//
// The value is not a value. "Subscribed" is a statement about a newsletter row and about the
// member's email_disabled flag at once, so it writes two clauses joined one way and denies
// itself joined the other. That is a property of the encoding, which is why it is a vocabulary
// rather than a plain type.

const KEY_PREFIX = 'newsletters.';
const SLUG_ATTRIBUTE = 'newsletters.slug';
const EMAIL_DISABLED = 'email_disabled';

const OPTIONS = [
    {value: 'subscribed', label: 'Subscribed'},
    {value: 'unsubscribed', label: 'Unsubscribed'}
];

/**
 * `slug` is the newsletter this vocabulary writes for, when the field is a named one. The
 * parameterised entry passes nothing and takes it from the key instead.
 */
export function newsletterSubscriptionSemantics(slug?: string): ValueSemantics<'is'> {
    return {
        operators: ['is'],
        serialize({operator, values}, ctx): SerializedValue | null {
            const writing = slug ?? ctx.params.slug;
            const value = values[0];

            if (!writing || operator !== 'is') {
                return null;
            }

            if (value === 'subscribed') {
                return {join: 'and', fragments: [{expression: writing}, {key: EMAIL_DISABLED, expression: '0'}]};
            }

            if (value === 'unsubscribed') {
                return {join: 'or', fragments: [{expression: `-${writing}`}, {key: EMAIL_DISABLED, expression: '1'}]};
            }

            return null;
        },
        // Only an addressing can name a field, and reading one of these means naming which
        // newsletter it is about. See `matchCompound` below.
        parse(): SemanticValue<'is'> | null {
            return null;
        }
    };
}

/**
 * A newsletter's clauses, and which newsletter they are about.
 *
 * The slug is read out of the clause rather than out of the field that happened to be asked, so
 * a saved filter naming one newsletter reads back as that newsletter — including one this site
 * no longer has — instead of being re-attributed to whichever entry was tried first.
 */
export function newsletterAddressing(slug?: string): FieldAddressing {
    return {
        address(predicate, ctx) {
            return (slug ?? ctx.params.slug) ? {valueKey: SLUG_ATTRIBUTE, values: predicate.values} : null;
        },

        // A newsletter filter is always a compound, so nothing reaches the simple dispatch.
        match() {
            return null;
        },

        matchCompound(node: AstNode): CompoundMatch | null {
            for (const join of ['and', 'or'] as const) {
                const children = getCompoundChildren(node, join === 'and' ? '$and' : '$or');

                if (!children || children.length !== 2) {
                    continue;
                }

                let named: string | undefined;
                let negated = false;
                let hasEmailDisabled = false;

                for (const child of children) {
                    const raw = child[SLUG_ATTRIBUTE];

                    if (typeof raw === 'string') {
                        named = raw;
                        negated = false;
                    }

                    const denied = readNegatedString(raw);

                    if (denied !== null) {
                        named = denied;
                        negated = true;
                    }

                    if (typeof child[EMAIL_DISABLED] === 'number') {
                        hasEmailDisabled = true;
                    }
                }

                if (!named || !hasEmailDisabled) {
                    continue;
                }

                // The slug clause's polarity is the subscription state. Serializing pairs it with
                // a fixed join and email_disabled value, but a hand-written filter may pair them
                // differently; the email_disabled clause only marks the compound as a newsletter
                // subscription filter, and never flips what it means.
                return {
                    kind: 'predicate',
                    predicate: {
                        field: `${KEY_PREFIX}${named}`,
                        operator: 'is',
                        values: [negated ? 'unsubscribed' : 'subscribed']
                    }
                };
            }

            return null;
        }
    };
}

export const NEWSLETTER_CLAUSE = SLUG_ATTRIBUTE;

export interface NewsletterDefinition {
    slug: string;
    name: string;
}

/**
 * One entry per newsletter a site has, carrying its name for the picker.
 *
 * Reading is unaffected by which of these is tried first: the addressing takes the slug from
 * the clause, so every entry answers for the newsletter the filter actually names.
 */
export function newsletterDescriptor(newsletter: NewsletterDefinition): FieldDescriptor {
    return {
        key: `${KEY_PREFIX}${newsletter.slug}`,
        semantics: newsletterSubscriptionSemantics(newsletter.slug),
        addressing: newsletterAddressing(newsletter.slug),
        operators: ['is'],
        options: OPTIONS,
        ui: {
            label: newsletter.name,
            type: 'select',
            searchable: false,
            hideOperatorSelect: true
        }
    };
}

export function newsletterProvider(newsletters: readonly NewsletterDefinition[] | undefined): FieldProvider {
    return {
        resolved: newsletters !== undefined,
        claims: [SLUG_ATTRIBUTE],
        fields: (newsletters ?? []).map(newsletterDescriptor)
    };
}

/** The entry answering for every newsletter, including one this build has not heard of. */
export const NEWSLETTER_FIELD: FieldDescriptor = {
    key: `${KEY_PREFIX}:slug`,
    semantics: newsletterSubscriptionSemantics(),
    addressing: newsletterAddressing(),
    operators: ['is'],
    options: OPTIONS,
    ui: {
        label: 'Newsletter',
        type: 'select',
        searchable: false,
        hideOperatorSelect: true
    }
};
