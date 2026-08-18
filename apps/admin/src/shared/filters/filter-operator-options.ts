import type {OperatorId} from './filter-operators';

interface OperatorOption {
    value: OperatorId;
    label: string;
}

interface CreateOperatorOptionsOptions {
    /** Keyed by operator id, so a label for an operator nobody defined fails to compile. */
    labels?: Partial<Record<OperatorId, string>>;
}

export function createOperatorOptions(
    operators: readonly OperatorId[],
    options: CreateOperatorOptionsOptions = {}
): OperatorOption[] {
    const labels = options.labels || {};

    return operators.map(operator => ({
        value: operator,
        label: labels[operator] ?? operator.replaceAll('-', ' ')
    }));
}
