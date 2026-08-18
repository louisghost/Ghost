import type {NqlComparator, NqlSymbol} from '@/shared/filters/nql-tokens';
import type {OperatorId} from '@/shared/filters/filter-operators';

// One table per vocabulary, read in both directions. An operator is declared once as a symbol
// and comparator pair, so it can either be written and read back, or neither.

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
 * The reverse index is derived rather than declared, so it cannot disagree with the forward
 * one. Two operators sharing a comparator would be ambiguous; the first entry wins — a vocabulary that
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
