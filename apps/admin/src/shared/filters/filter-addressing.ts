import {extractComparator, getCompoundChildren} from './filter-ast';
import type {AstNode} from './filter-ast';
import type {CodecContext, FilterCodec, FilterPredicate, ParsedPredicate} from './filter-types';
import type {OperatorId, PresenceOperator} from './filter-operators';
import type {ClauseGroup, SemanticValue, SerializedValue, ValueComparator, ValueSemantics} from './semantics';

// A custom field is named in the *value* position, because its key may hold characters NQL's
// key position cannot. One predicate therefore becomes a pair of clauses:
//
//   name:~'ghost'                                              // column
//   (custom_fields.key:'company'+custom_fields.value:~'ghost') // relation

/** Where a predicate's value goes, and what is left for the semantics to express. */
export interface FieldAddress {
    /** The NQL key the value expression hangs off. */
    valueKey: string;
    /** Clauses that must accompany it to name the field, grouped with it when present. */
    companions?: string[];
    /** The values the semantics should serialize — the predicate's, minus what the addressing owns. */
    values: unknown[];
}

/** A node recognized as this field's, and the comparator carrying its value. */
export interface MatchedValue {
    comparator: ValueComparator;
    /** The predicate field key, when the addressing determines it rather than the context. */
    field?: string;
    /** Values the addressing contributes, prepended to the semantics' values. */
    leadingValues?: unknown[];
}

/**
 * A node this addressing recognizes: either a complete predicate it answers alone
 * (presence, which has no value to interpret), or a value for the semantics to read.
 */
export type CompoundMatch =
    | {kind: 'predicate'; predicate: ParsedPredicate}
    | ({kind: 'value'} & MatchedValue);

interface FieldAddressingBase {
    address: (predicate: FilterPredicate, ctx: CodecContext) => FieldAddress | null;
    match: (node: AstNode, ctx: CodecContext) => MatchedValue | null;
    /**
     * A node whose field key is not the node's key, so the key-based dispatch in
     * filter-query-core.ts cannot route it here. Consulted before that dispatch.
     */
    matchCompound?: (node: AstNode) => CompoundMatch | null;
}

/**
 * Presence — whether a value exists at all — is answered by the addressing rather than the
 * value, so only a relation has it; a column is always set. The operators and the clause that
 * writes them are declared together, because offering one without the other would advertise an
 * operator that serializes to nothing and drops itself from the query.
 */
/** An addressing with no notion of presence: a column is always set, so it cannot be asked. */
export type PlainAddressing = FieldAddressingBase & {presenceOperators?: undefined; addressPresence?: undefined};

/** An addressing that can answer whether a value exists at all, which only a relation can. */
export type PresenceAddressing = FieldAddressingBase & {
    presenceOperators: readonly PresenceOperator[];
    addressPresence: (predicate: FilterPredicate, ctx: CodecContext) => string[] | null;
};

export type FieldAddressing = PlainAddressing | PresenceAddressing;

/** Clauses joined into one filter term, grouped only when there is more than one. */
function combine(clauses: string[], join: 'and' | 'or' = 'and', group = false): string {
    if (clauses.length === 1 && !group) {
        return clauses[0];
    }

    return `(${clauses.join(join === 'and' ? '+' : ',')})`;
}

/** Every clause a value wrote, keyed by the addressing's key unless it named its own. */
function writtenClauses(written: SerializedValue, valueKey: string): {clauses: string[]; join: 'and' | 'or'} {
    if (typeof written === 'string') {
        return {clauses: [`${valueKey}:${written}`], join: 'and'};
    }

    return {
        clauses: written.fragments.map(fragment => `${fragment.key ?? valueKey}:${fragment.expression}`),
        join: written.join ?? 'and'
    };
}

/** The field's key is the NQL key, unless `config.field` renames it. */
export function columnAddressing(config?: {field?: string}): PlainAddressing {
    const keyFor = (ctx: CodecContext) => config?.field ?? ctx.key;

    return {
        address(predicate, ctx) {
            return {valueKey: keyFor(ctx), values: predicate.values};
        },
        match(node, ctx) {
            const comparator = extractComparator(node);

            if (!comparator || comparator.field !== keyFor(ctx)) {
                return null;
            }

            return {comparator: {operator: comparator.operator, value: comparator.value}};
        }
    };
}

/**
 * A node read as the group of clauses it is, so a vocabulary that wrote several can recognize
 * them together. A single clause is a group of one, which is how a value that collapses to one
 * clause is still found.
 */
function toClauseGroup(node: AstNode): ClauseGroup | null {
    for (const join of ['and', 'or'] as const) {
        const children = getCompoundChildren(node, join === 'and' ? '$and' : '$or');

        if (children) {
            const clauses = children.map(child => extractComparator(child)).filter(comparator => comparator !== undefined);

            return clauses.length === children.length
                ? {join, clauses: clauses.map(({field, operator, value}) => ({key: field, operator, value}))}
                : null;
        }
    }

    const comparator = extractComparator(node);

    return comparator ? {join: 'and', clauses: [{key: comparator.field, operator: comparator.operator, value: comparator.value}]} : null;
}

function toPredicate(matched: MatchedValue, parsed: SemanticValue, ctx: CodecContext): ParsedPredicate {
    return {
        field: matched.field ?? ctx.key,
        operator: parsed.operator,
        values: [...(matched.leadingValues ?? []), ...parsed.values]
    };
}

/**
 * One grammar plus one vocabulary makes a codec, and each keeps to its own side: the
 * addressing does not inspect an operator it has not claimed as presence, and a vocabulary is
 * handed values rather than the field they came from.
 *
 * A vocabulary writing several clauses is the exception — it has to name the keys it writes,
 * as `subscriptionSemantics` does for `email_disabled`. It still never learns the key of the
 * field it is serving, which is the addressing's to know.
 */
export function composeCodec<TOperator extends OperatorId>(
    addressing: FieldAddressing,
    semantics: ValueSemantics<TOperator>
): FilterCodec {
    return {
        parse(node, ctx) {
            const matched = addressing.match(node, ctx);

            if (!matched) {
                return null;
            }

            const parsed = semantics.parse(matched.comparator, ctx);

            if (!parsed) {
                return null;
            }

            return toPredicate(matched, parsed, ctx);
        },
        serialize(predicate, ctx) {
            if (addressing.presenceOperators?.some(operator => operator === predicate.operator)) {
                return addressing.addressPresence(predicate, ctx);
            }

            const address = addressing.address(predicate, ctx);

            if (!address) {
                return null;
            }

            // An operator the vocabulary does not list produces no clause rather than a broken
            // one; the vocabulary's own `operators` is what a type is checked against.
            const operator = semantics.operators.find(candidate => candidate === predicate.operator);

            if (operator === undefined) {
                return null;
            }

            const written = semantics.serialize({operator, values: address.values}, ctx);

            if (written === null) {
                return null;
            }

            const {clauses, join} = writtenClauses(written, address.valueKey);
            // A value that wrote its own clauses stays grouped even when there is one of them,
            // because the group is what marks it as this field's rather than a bare column's.
            const grouped = typeof written !== 'string';

            return [combine([...(address.companions ?? []), ...clauses], join, grouped)];
        },
        parseCompound: semantics.parseClauses
            ? (node, ctx) => {
                const group = toClauseGroup(node);

                if (!group) {
                    return null;
                }

                const parsed = semantics.parseClauses?.(group, ctx);

                if (!parsed) {
                    return null;
                }

                return {field: ctx.key, operator: parsed.operator, values: parsed.values};
            }
            : addressing.matchCompound
            ? (node, ctx) => {
                const matched = addressing.matchCompound?.(node);

                if (!matched) {
                    return null;
                }

                if (matched.kind === 'predicate') {
                    return matched.predicate;
                }

                const parsed = semantics.parse(matched.comparator, ctx);

                if (!parsed) {
                    return null;
                }

                return toPredicate(matched, parsed, ctx);
            }
            : undefined
    };
}
