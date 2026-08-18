import type {ValueSemantics} from './types';

/**
 * A yes or no answered by a count.
 *
 * Nothing is stored as a boolean: "has reports" is a number greater than zero, and "has more
 * than one subscription" is a number greater than one. The threshold, and how the negative is
 * written, are the field's to configure — which is why two fields that read identically in the
 * UI can emit different NQL without either needing a codec of its own.
 */
export interface CountConfig {
    /** A count above this answers yes. */
    threshold: number;
    /**
     * How no is written: as the threshold itself, or as anything below the next value up.
     * Both mean the same thing to the database and are not the same string.
     */
    absentForm: 'equals' | 'below';
}

export type CountOperator = 'is';

const DEFAULT_COUNT_CONFIG: CountConfig = {threshold: 0, absentForm: 'equals'};

export function countSemantics(config: CountConfig = DEFAULT_COUNT_CONFIG): ValueSemantics<CountOperator> {
    const {threshold, absentForm} = config;
    const absent = absentForm === 'equals' ? `${threshold}` : `<${threshold + 1}`;

    return {
        operators: ['is'],
        serialize({operator, values}) {
            const value = values[0];

            if (operator !== 'is') {
                return null;
            }

            if (value === 'true') {
                return `>${threshold}`;
            }

            return value === 'false' ? absent : null;
        },
        parse({operator, value}) {
            if (operator === '$gt' && value === threshold) {
                return {operator: 'is', values: ['true']};
            }

            const matchesAbsent = absentForm === 'equals'
                ? operator === '$eq' && value === threshold
                : operator === '$lt' && value === threshold + 1;

            return matchesAbsent ? {operator: 'is', values: ['false']} : null;
        }
    };
}
