import {escapeNqlString} from '@tryghost/nql-string';
import type {ValueConfig} from './types';

// Turning a value into the token NQL will accept, shared by every vocabulary that writes
// one: quoting is a property of the characters in the value, not of the type holding it.

const UNQUOTED_TOKEN_PATTERN = /^[A-Za-z0-9_.-]+$/;

export function normalizeMultiValue(values: unknown[]): string[] {
    return values.map(value => String(value)).sort((left, right) => left.localeCompare(right));
}

export function serializeScalarValue(value: unknown, config?: ValueConfig): string {
    if (typeof value === 'string') {
        if (config?.quoteStrings || value.startsWith('-') || !UNQUOTED_TOKEN_PATTERN.test(value)) {
            return escapeNqlString(value);
        }

        return value;
    }

    return String(value);
}

// A trailing `$` anchors the regex only when it isn't itself escaped: a value holding a
// literal `$` (contains `5$`) reaches here as the source `5\$`, which still ends in `$`.
// An odd run of backslashes before it means it is escaped, so it is part of the value.
// A literal `^` is always escaped to `\^`, so a leading `^` needs no such check.
