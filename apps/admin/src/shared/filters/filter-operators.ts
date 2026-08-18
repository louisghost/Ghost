// Every operator this engine knows, named once.
//
// An operator id is not a free string. It has to satisfy three agreements at once: a
// vocabulary must be able to encode it into NQL, that same vocabulary must read it back out,
// and the picker must be able to label it. Nothing enforced any of those while an operator was
// a `string`, so a typo produced a filter that silently refused to serialize.
//
// The union closes the naming half. The encoding half is closed alongside it: each vocabulary
// declares which of these it can express, and a type may only advertise operators drawn from
// that set — see the `satisfies` clauses in filter-registry.ts.

/** Operators that ask something of a value, and so belong to a type. */
export const VALUE_OPERATORS = [
    'is',
    'is-not',
    'contains',
    'does-not-contain',
    'starts-with',
    'does-not-start-with',
    'ends-with',
    'does-not-end-with',
    'is-any',
    'is-not-any',
    'is-greater',
    'is-or-greater',
    'is-less',
    'is-or-less',
    'in-the-last',
    'in-the-next'
] as const;

export type ValueOperator = typeof VALUE_OPERATORS[number];

/**
 * Operators that ask whether there is a value at all, and so belong to the addressing. A column
 * always has one, so only a value reached through a relation offers these.
 */
export const PRESENCE_OPERATORS = ['is-set', 'is-not-set'] as const;

export type PresenceOperator = typeof PRESENCE_OPERATORS[number];

/**
 * Operators a single field defines for itself, meaning nothing to any type.
 *
 * Newsletter feedback is the only one: its operator is the score being asked about, so "more
 * like this" is the operator `1` rather than a comparison against a value.
 */
export const DOMAIN_OPERATORS = ['1', '0'] as const;

export type DomainOperator = typeof DOMAIN_OPERATORS[number];

export type OperatorId = ValueOperator | PresenceOperator | DomainOperator;

export const OPERATOR_IDS: readonly OperatorId[] = [...VALUE_OPERATORS, ...PRESENCE_OPERATORS, ...DOMAIN_OPERATORS];

/**
 * Whether a string names an operator this engine knows.
 *
 * The guard exists for the boundary with the filter UI, which hands operators back as plain
 * strings: this is where one becomes an id again, rather than being assumed to be one.
 */
export function isOperatorId(value: string): value is OperatorId {
    return OPERATOR_IDS.some(operator => operator === value);
}
