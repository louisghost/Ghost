import type {CodecContext} from '@/shared/filters/filter-types';
import type {OperatorId} from '@/shared/filters/filter-operators';


export interface ValueComparator {
    operator: string;
    value: unknown;
}

/**
 * One clause a value writes. Some values write several on keys of their own — subscribed is a
 * statement about a newsletter row and about email_disabled at once, and neither means it alone.
 */
export interface ClauseFragment {
    /** The NQL key. Omitted to use the key the addressing named. */
    key?: string;
    expression: string;
}

/** A bare string writes one clause on the addressing's key; fragments write several. */
export interface WrittenValue {
    join?: 'and' | 'or';
    fragments: ClauseFragment[];
}

export type SerializedValue = string | WrittenValue;

/** A clause as the parse side sees it: a key, and the comparator its value carries. */
export interface ClauseComparator extends ValueComparator {
    key: string;
}

/** A group of clauses and how they were joined — the join is part of the meaning. */
export interface ClauseGroup {
    join: 'and' | 'or';
    clauses: readonly ClauseComparator[];
}

/** A predicate's operator and values, minus anything the addressing owns. */
export interface SemanticValue<TOperator extends OperatorId = OperatorId> {
    operator: TOperator;
    values: unknown[];
}

/**
 * `operators` is what this vocabulary can write into NQL. A type may offer a subset and no
 * more; the registry checks that where types are declared.
 */
export interface ValueSemantics<TOperator extends OperatorId = OperatorId> {
    readonly operators: readonly TOperator[];
    /** What this value writes, or null when it can't be expressed. */
    serialize: (input: SemanticValue, ctx: CodecContext) => SerializedValue | null;
    /** A comparator read back into a predicate operator and values, or null for a shape this doesn't emit. */
    parse: (comparator: ValueComparator, ctx: CodecContext) => SemanticValue<TOperator> | null;
    /** Given every clause in the group, so it can require the combination, not any one clause. */
    parseClauses?: (group: ClauseGroup, ctx: CodecContext) => SemanticValue<TOperator> | null;
}

export interface ValueConfig {
    quoteStrings?: boolean;
    serializeSingletonAsScalar?: boolean;
}

