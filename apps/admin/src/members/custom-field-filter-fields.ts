import {CUSTOM_FIELD_SET_OPERATORS, customFieldAddressing} from './custom-field-addressing';
import {FILTER_TYPES, filterType} from '@/shared/filters';
import {memberCustomFieldKind} from '@tryghost/admin-x-framework/api/member-custom-fields';
import type {FieldDescriptor, FieldProvider, FilterTypeId, OperatorId} from '@/shared/filters';
import type {MemberCustomField, MemberCustomFieldKind} from '@tryghost/admin-x-framework/api/member-custom-fields';

// A defined custom field, described by the type its values actually hold.
//
// The catalogue already has one entry answering for any custom field, which reads every value
// as text. That entry stays and is what makes a filter readable before the definitions arrive,
// or when it names a field that has since been deleted. These entries are the more precise
// reading laid over it: once a site's fields are known, a date field is compared as a date.

/**
 * Which filter type each kind of value is compared as.
 *
 * Exhaustive over `FieldKind`, so a kind added to the shared catalog fails to compile here
 * until someone says how it filters.
 */
const FILTER_TYPE_FOR_KIND: Record<MemberCustomFieldKind, FilterTypeId> = {
    text: 'text',
    date: 'plain_date',
    number: 'number',
    // A record has no value of its own to compare: the whole field answers only whether any
    // part is set, and a part is filtered as its own kind.
    record: 'composite'
};

/** The clause prefix a custom field filter is written with, which is not its predicate key. */
export const CUSTOM_FIELD_CLAUSE = 'custom_fields.';

export interface CustomFieldDefinition {
    key: string;
    name: string;
    type: MemberCustomField['type'];
}

function filterTypeFor(type: MemberCustomField['type']): FilterTypeId {
    return FILTER_TYPE_FOR_KIND[memberCustomFieldKind(type)] ?? 'text';
}

/**
 * The type a part of a composite is compared as. Every part Ghost declares today is text; the
 * lookup exists so that stops being an assumption the moment a part declares otherwise.
 */
function partFilterType(): FilterTypeId {
    return 'text';
}

/** One entry per defined field, carrying the operators and vocabulary its type implies. */
export function customFieldDescriptor(definition: CustomFieldDefinition): FieldDescriptor {
    const type = filterTypeFor(definition.type);
    const isComposite = type === 'composite';
    const valueType = isComposite ? partFilterType() : type;
    const operators: readonly OperatorId[] = isComposite
        ? [...FILTER_TYPES[partFilterType()].operators, ...CUSTOM_FIELD_SET_OPERATORS]
        : [...FILTER_TYPES[type].operators, ...CUSTOM_FIELD_SET_OPERATORS];

    return {
        key: `custom_field.${definition.key}`,
        type: valueType,
        // Bound to this field's key: a named entry resolves by exact key, so there is no
        // parameter to read it from the way the shared entry does.
        addressing: customFieldAddressing(definition.key),
        operators,
        ui: {
            label: definition.name,
            type: 'custom',
            component: 'custom-field',
            control: FILTER_TYPES[valueType].control,
            defaultOperator: isComposite
                ? CUSTOM_FIELD_SET_OPERATORS[0]
                : filterType(type).defaultOperator ?? CUSTOM_FIELD_SET_OPERATORS[0]
        }
    };
}

/** The value control a field's own type asks for, used by the pill's value segment. */
export function customFieldValueControl(type: MemberCustomField['type']): 'text' | 'date' | 'number' {
    const resolved = filterTypeFor(type);
    const control = FILTER_TYPES[resolved === 'composite' ? partFilterType() : resolved].control;

    return control === 'date' || control === 'number' ? control : 'text';
}

export function customFieldProvider(definitions: readonly CustomFieldDefinition[] | undefined): FieldProvider {
    return {
        resolved: definitions !== undefined,
        claims: [CUSTOM_FIELD_CLAUSE],
        fields: (definitions ?? []).map(customFieldDescriptor)
    };
}
