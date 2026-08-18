import type {ValueSemantics} from './types';

/**
 * A value that cannot be compared, for a type whose values are containers rather than things.
 * Anything asked of it fails to encode, which is the honest answer: the question belongs to
 * one of its parts.
 */
export function noSemantics(): ValueSemantics<never> {
    return {
        operators: [],
        serialize() {
            return null;
        },
        parse() {
            return null;
        }
    };
}
