import type {NqlComparator, NqlSymbol} from '@/shared/filters/nql-tokens';
import type {OperatorId} from '@/shared/filters/filter-operators';

// One table per vocabulary, read in both directions.
//
// An operator used to be declared twice: once as the symbol that writes it, once as the NQL
// comparator that reads it back. Nothing tied the two together, so a vocabulary could gain a
// symbol it had no way of parsing and still compile — the kind of asymmetry only a round-trip
// test would catch, and tests are not where this should be caught.
//
// Declaring the pair once makes that impossible: the writing side and the reading side are
// derived from the same entries, so an operator either does both or neither.

export interface OperatorEncoding {
    /** What follows `key:` when this operator is written. */
    symbol: NqlSymbol;
    /** The comparator nql produces when that is parsed back. */
    comparator: NqlComparator;
}

export type OperatorTable<TOperator extends OperatorId> = Readonly<Record<TOperator, OperatorEncoding>>;

export interface BidirectionalOperators<TOperator extends OperatorId> {
    /** Every operator the table declares, which is exactly what the vocabulary can express. */
    operators: readonly TOperator[];
    /** The symbol that writes an operator, or undefined when it isn't in the table. */
    symbolFor: (operator: string) => NqlSymbol | undefined;
    /** The operator a comparator reads back to, or undefined when nothing writes that shape. */
    operatorFor: (comparator: string) => TOperator | undefined;
}

/**
 * Both directions of a table, derived from its entries.
 *
 * The reverse index is built here rather than declared, so it cannot disagree with the
 * forward one. Two operators sharing a comparator would make the reverse ambiguous, so the
 * first entry wins and the table is expected to be written unambiguously — a vocabulary that
 * genuinely needs two readings of one comparator (text, whose anchors carry meaning the
 * comparator does not) parses by hand instead.
 */
export function bidirectional<TOperator extends OperatorId>(table: OperatorTable<TOperator>): BidirectionalOperators<TOperator> {
    const entries = Object.entries(table) as [TOperator, OperatorEncoding][];
    const byComparator = new Map<string, TOperator>();

    for (const [operator, encoding] of entries) {
        if (!byComparator.has(encoding.comparator)) {
            byComparator.set(encoding.comparator, operator);
        }
    }

    return {
        operators: entries.map(([operator]) => operator),
        symbolFor(operator) {
            return entries.find(([candidate]) => candidate === operator)?.[1].symbol;
        },
        operatorFor(comparator) {
            return byComparator.get(comparator);
        }
    };
}
