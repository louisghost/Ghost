// The query language's own vocabulary, as opposed to ours.
//
// An operator id is a name we chose; a symbol and a comparator are not. The symbol is what NQL
// accepts after `key:`, and the comparator is what its parser hands back. Both were plain
// strings, so a vocabulary could declare `$greater` or `>>` and compile — a filter that simply
// never matched, with nothing to say why.

/** Every token NQL accepts between a key and its value. */
export const NQL_SYMBOLS = ['', '-', '>', '>=', '<', '<=', '~', '-~', '~^', '-~^', '~$', '-~$'] as const;

export type NqlSymbol = typeof NQL_SYMBOLS[number];

/** Every comparator NQL's parser produces for a value. */
export const NQL_COMPARATORS = ['$eq', '$ne', '$gt', '$gte', '$lt', '$lte', '$in', '$nin', '$regex', '$not'] as const;

export type NqlComparator = typeof NQL_COMPARATORS[number];
