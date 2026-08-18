import type {AstNode} from './filter-ast';
import type {FilterFieldConfig} from '@tryghost/shade/patterns';
import type {OperatorId} from './filter-operators';

/**
 * The controls a filter pill can render, taken from the design system rather than restated.
 *
 * A narrower copy lived here and had drifted: the pill already knew how to render a boolean, a
 * date range and an email, and this list did not, so a type wanting one of them failed to
 * compile for a reason that had nothing to do with whether it was expressible.
 */
export type FilterControl = NonNullable<FilterFieldConfig['type']>;

export interface FilterPredicate {
    id: string;
    field: string;
    operator: string;
    values: unknown[];
}

export type ParsedPredicate = Omit<FilterPredicate, 'id'>;

export interface CodecContext {
    key: string;
    pattern: string;
    params: Record<string, string>;
    timezone: string;
}

export interface FilterCodec {
    parse: (node: AstNode, ctx: CodecContext) => ParsedPredicate | null;
    serialize: (predicate: FilterPredicate, ctx: CodecContext) => string[] | null;
    /**
     * A grouped node whose field key is carried in a clause value rather than the node's
     * key, so the key-based dispatch cannot route it. Tried before that dispatch, and it
     * names the predicate's field itself.
     */
    parseCompound?: (node: AstNode, ctx: CodecContext) => ParsedPredicate | null;
}

export interface FilterField {
    operators: readonly OperatorId[];
    parseKeys?: readonly string[];
    ui: {
        label: string;
        type: FilterControl;
        [key: string]: unknown;
    };
    options?: Array<{value: string; label: string}>;
    metadata?: {
        activeColumn?: {
            key: string;
            label: string;
            include?: string;
        };
    };
    codec: FilterCodec;
}

