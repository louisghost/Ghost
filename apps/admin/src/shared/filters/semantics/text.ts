import {escapeNqlString} from '@tryghost/nql-string';
import type {NqlSymbol} from '@/shared/filters/nql-tokens';
import type {OperatorId} from '@/shared/filters/filter-operators';
import type {ValueSemantics} from './types';

// Text is the one vocabulary that cannot be a bidirectional table. Four of its operators
// share the `$regex` comparator and are told apart by the anchors in the pattern, so the
// reading side needs the pattern itself and not just the comparator that carried it.

const TEXT_OPERATOR_SYMBOLS = {
    contains: '~',
    'does-not-contain': '-~',
    'starts-with': '~^',
    'does-not-start-with': '-~^',
    'ends-with': '~$',
    'does-not-end-with': '-~$'
} as const satisfies Partial<Record<OperatorId, NqlSymbol>>;

const TEXT_SYMBOLS: Partial<Record<OperatorId, string>> = TEXT_OPERATOR_SYMBOLS;

/** What `textSemantics` can express: the equality pair plus every anchored match. */
export type TextOperator = 'is' | 'is-not' | keyof typeof TEXT_OPERATOR_SYMBOLS;
export const TEXT_OPERATORS = [
    'is', 'is-not', 'contains', 'does-not-contain', 'starts-with', 'does-not-start-with', 'ends-with', 'does-not-end-with'
] as const satisfies readonly TextOperator[];

function hasEndAnchor(source: string): boolean {
    if (!source.endsWith('$')) {
        return false;
    }

    let backslashes = 0;

    for (let index = source.length - 2; index >= 0 && source[index] === '\\'; index -= 1) {
        backslashes += 1;
    }

    return backslashes % 2 === 0;
}

// Which anchors a regex carries, and the value left once they are removed. Read together
// rather than one at a time: the operator and the value are two answers to the same
// question, and deciding the anchors twice is how a value could keep a `$` the operator
// had already consumed.
function decomposeRegex(pattern: RegExp): {anchorStart: boolean; anchorEnd: boolean; value: string} {
    const source = pattern.source;
    const anchorStart = source.startsWith('^');
    const anchorEnd = hasEndAnchor(source);
    const body = source.slice(anchorStart ? 1 : 0, anchorEnd ? -1 : undefined);

    return {
        anchorStart,
        anchorEnd,
        value: body.replace(/\\([\\.^$|?*+()[\]{}/-])/g, '$1')
    };
}

// Anchors read back into the operator that would have produced them. Both anchors is not
// an operator this vocabulary emits, so it falls back to the unanchored reading.
function anchorsToOperator(anchorStart: boolean, anchorEnd: boolean, negated: boolean): TextOperator {
    if (anchorStart && !anchorEnd) {
        return negated ? 'does-not-start-with' : 'starts-with';
    }

    if (anchorEnd && !anchorStart) {
        return negated ? 'does-not-end-with' : 'ends-with';
    }

    return negated ? 'does-not-contain' : 'contains';
}

/**
 * Text: the equality pair plus the substring matches. `is` / `is-not` compare the whole
 * value (`$eq` / `$ne`); the rest are regexes whose anchors carry the operator.
 */
export function textSemantics(): ValueSemantics<TextOperator> {
    return {
        operators: TEXT_OPERATORS,
        serialize({operator, values}) {
            const rawValue = values[0];

            if (typeof rawValue !== 'string' || rawValue === '') {
                return null;
            }

            if (operator === 'is') {
                return escapeNqlString(rawValue);
            }

            if (operator === 'is-not') {
                return `-${escapeNqlString(rawValue)}`;
            }

            const symbol = TEXT_SYMBOLS[operator];

            if (!symbol) {
                return null;
            }

            return `${symbol}${escapeNqlString(rawValue)}`;
        },
        parse({operator, value}) {
            if (operator === '$eq' && typeof value === 'string') {
                return {operator: 'is', values: [value]};
            }

            if (operator === '$ne' && typeof value === 'string') {
                return {operator: 'is-not', values: [value]};
            }

            if ((operator === '$regex' || operator === '$not') && value instanceof RegExp) {
                const {anchorStart, anchorEnd, value: text} = decomposeRegex(value);

                return {
                    operator: anchorsToOperator(anchorStart, anchorEnd, operator === '$not'),
                    values: [text]
                };
            }

            return null;
        }
    };
}

/**
 * A single value compared for equality, quoted only when it has to be.
 */
