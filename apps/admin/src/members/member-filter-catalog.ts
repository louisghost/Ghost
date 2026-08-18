import {buildProvidedCatalog, catalogCanRead} from '@/shared/filters';
import {customFieldProvider, type CustomFieldDefinition} from './custom-fields/filter-fields';
import {MEMBER_FIELD_DESCRIPTORS, memberFields} from './member-fields';
import {newsletterProvider, type NewsletterDefinition} from './newsletter-filter-fields';
import type {FieldProvider, FilterField} from '@/shared/filters';

// Which fields a site can be filtered by.
//
// The static catalog already answers for every field, including the parameterised entries
// that read any newsletter or any custom field. What a site's own definitions add is precision:
// a date custom field compared as a date rather than as text, and a newsletter shown by name.
//
// That layering is what keeps a filter readable at every moment. Before the definitions arrive
// the parameterised entries answer; after, the per-field entries do. Neither state loses a
// clause, so the only thing waiting protects is reading a value as the type it really is.

export type MemberFields = Record<string, FilterField>;

export interface MemberCatalogSources {
    newsletters?: readonly NewsletterDefinition[];
    customFields?: readonly CustomFieldDefinition[];
}

/**
 * The providers behind a catalog, in resolution order.
 *
 * The static provider goes first so a site's own definitions override its parameterised
 * entries on a key clash. A source given as `undefined` has not loaded; given as an array —
 * even an empty one — it has, which is how a site with no custom fields is told apart from one
 * whose custom fields have not arrived.
 */
export function memberFieldProviders({newsletters, customFields}: MemberCatalogSources = {}): FieldProvider[] {
    return [
        {resolved: true, fields: MEMBER_FIELD_DESCRIPTORS},
        newsletterProvider(newsletters),
        customFieldProvider(customFields)
    ];
}

export function buildMemberFields(sources: MemberCatalogSources = {}): MemberFields {
    if (!sources.newsletters && !sources.customFields) {
        return memberFields;
    }

    return buildProvidedCatalog(memberFieldProviders(sources));
}

/**
 * Whether this filter can be read as precisely as it will ever be read.
 *
 * False only while a source it names is still in flight. It is not a correctness gate — the
 * parameterised entries read the filter either way — so it decides whether to wait before
 * rewriting the URL, not whether the filter can be understood at all.
 */
export function canReadMemberFilter(filter: string | undefined, sources: MemberCatalogSources = {}): boolean {
    return catalogCanRead(filter, memberFieldProviders(sources));
}
