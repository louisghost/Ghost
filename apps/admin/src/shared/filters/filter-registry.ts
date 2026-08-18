import {DATE_OPERATOR_LABELS, DEFAULT_DATE_OPERATOR} from './filter-date';
import {
    PLAIN_DATE_OPERATORS,
    SCALAR_VALUE_OPERATORS,
    SET_VALUE_OPERATORS,
    countSemantics,
    dateSemantics,
    noSemantics,
    numberSemantics,
    plainDateSemantics,
    scalarSemantics,
    setSemantics,
    textSemantics
} from './semantics';
import type {FilterControl} from './filter-types';
import type {OperatorId} from './filter-operators';
import type {ValueSemantics} from './semantics';

export interface FilterTypeDefinition<TOperator extends OperatorId = OperatorId, TConfig = void> {
    semantics: (config?: TConfig) => ValueSemantics<TOperator>;
    /** Offered unless a field narrows them further. */
    operators: readonly TOperator[];
    /** Becomes the field's `ui.type` unless the field sets its own. */
    control: FilterControl;
    /**
     * What this type's operators are called in the picker. An operator id means different
     * things to different types — `is-or-greater` is "on or after" for a moment in time and
     * "is at least" for a number — so the wording belongs to the type, not to the id.
     */
    labels?: Partial<Record<TOperator, string>>;
    defaultOperator?: OperatorId;
}


function defineFilterType<TOperator extends OperatorId, TConfig>(definition: {
    semantics: (config?: TConfig) => ValueSemantics<TOperator>;
    // NoInfer forces the operator set to come from the semantics alone, so this list is
    // checked against it. Without it, an unencodable operator would widen the set and compile.
    operators: readonly NoInfer<TOperator>[];
    control: FilterControl;
    labels?: Partial<Record<NoInfer<TOperator>, string>>;
    defaultOperator?: NoInfer<TOperator>;
}): FilterTypeDefinition<TOperator, TConfig> {
    return definition;
}

export const FILTER_TYPES = {
    text: defineFilterType({
        semantics: textSemantics,
        // Negated anchors are encodable but read poorly in a pill, so they are not offered.
        operators: ['is', 'is-not', 'contains', 'does-not-contain', 'starts-with', 'ends-with'],
        control: 'text',
        defaultOperator: 'contains'
    }),
    scalar: defineFilterType({
        semantics: scalarSemantics,
        operators: SCALAR_VALUE_OPERATORS,
        control: 'select'
    }),
    set: defineFilterType({
        semantics: setSemantics,
        operators: SET_VALUE_OPERATORS,
        control: 'multiselect',
        defaultOperator: 'is-any'
    }),
    number: defineFilterType({
        semantics: numberSemantics,
        // `is-or-greater` and `is-or-less` are encodable but not offered here.
        operators: ['is', 'is-greater', 'is-less'],
        control: 'number',
        labels: {'is-greater': 'is greater than', 'is-less': 'is less than'}
    }),
    /** An instant. Bounds a whole day in the site's timezone, so the zone changes what it means. */
    timestamp: defineFilterType({
        semantics: dateSemantics,
        // The relative pair is encodable; a field opts into it rather than every timestamp offering it.
        operators: PLAIN_DATE_OPERATORS,
        control: 'date',
        labels: DATE_OPERATOR_LABELS,
        defaultOperator: DEFAULT_DATE_OPERATOR
    }),
    /** A calendar day, stored as ISO `YYYY-MM-DD` and compared as text. No time, no zone. */
    plain_date: defineFilterType({
        semantics: plainDateSemantics,
        operators: PLAIN_DATE_OPERATORS,
        control: 'date',
        labels: DATE_OPERATOR_LABELS,
        defaultOperator: DEFAULT_DATE_OPERATOR
    }),
    /** A yes or no stored as a count. Each field configures its own threshold and negative. */
    count: defineFilterType({
        semantics: countSemantics,
        operators: ['is'],
        control: 'select'
    }),
    /** Named parts and no value of its own. Offers no operators; presence comes from the addressing. */
    composite: defineFilterType({
        semantics: noSemantics,
        operators: [],
        control: 'custom'
    })
} as const;

export type FilterTypeId = keyof typeof FILTER_TYPES;

export interface FilterTypeFacts {
    operators: readonly OperatorId[];
    control: FilterControl;
    labels?: Partial<Record<OperatorId, string>>;
    defaultOperator?: OperatorId;
}

/** Reads a type as the facts common to all of them, so callers need not narrow. */
export function filterType(id: FilterTypeId): FilterTypeFacts {
    return FILTER_TYPES[id];
}

export type ConfigOf<TType extends FilterTypeId> = Parameters<typeof FILTER_TYPES[TType]['semantics']>[0];

