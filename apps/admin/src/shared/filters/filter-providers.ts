import {FILTER_TYPES} from './filter-registry';
import {columnAddressing, composeCodec} from './filter-addressing';
import type {FieldAddressing} from './filter-addressing';
import type {ConfigOf, FilterTypeFacts, FilterTypeId} from './filter-registry';
import type {FilterField} from './filter-types';
import type {ValueSemantics} from './semantics';
import type {OperatorId} from './filter-operators';



interface FieldDescriptorBase {
    key: string;
    /** Where the value lives. Defaults to a column of the same name. */
    addressing?: FieldAddressing;
    /** Narrows the derived operators. Never widens: a field cannot offer what its codec can't encode. */
    operators?: readonly OperatorId[];
    ui: Omit<FilterField['ui'], 'type'> & {type?: FilterField['ui']['type']};
    options?: FilterField['options'];
    metadata?: FilterField['metadata'];
    parseKeys?: readonly string[];
}

/**
 * Distributed over `FilterTypeId` so the config is checked against the type named beside it:
 * a count's threshold cannot be handed to a text field.
 */
type TypedFieldDescriptor = {
    [TType in FilterTypeId]: FieldDescriptorBase & {
        type: TType;
        valueConfig?: ConfigOf<TType>;
    }
}[FilterTypeId];

/** A field whose vocabulary is defined by its own domain rather than named in the registry. */
interface DomainFieldDescriptor extends FieldDescriptorBase {
    type?: undefined;
    valueConfig?: undefined;
    semantics: ValueSemantics;
}

export type FieldDescriptor = TypedFieldDescriptor | DomainFieldDescriptor;


// Each branch narrows to a single type, which is what lets its config be that type's own.
function semanticsFor(descriptor: FieldDescriptor) {
    switch (descriptor.type) {
    case 'count':
        return FILTER_TYPES.count.semantics(descriptor.valueConfig);
    case 'scalar':
        return FILTER_TYPES.scalar.semantics(descriptor.valueConfig);
    case 'set':
        return FILTER_TYPES.set.semantics(descriptor.valueConfig);
    case undefined:
        return descriptor.semantics;
    default:
        return FILTER_TYPES[descriptor.type].semantics();
    }
}

export function describeField(descriptor: FieldDescriptor): FilterField {
    const addressing = descriptor.addressing ?? columnAddressing();
    // Through the interface, not the literal union: only some types name a default operator.
    const registered: FilterTypeFacts | undefined = descriptor.type ? FILTER_TYPES[descriptor.type] : undefined;
    const semantics = semanticsFor(descriptor);
    const presenceOperators = addressing.presenceOperators ?? [];
    // What this field can express at all: its vocabulary, plus whatever the addressing can ask
    // about presence. A type narrows this for taste; nothing may go outside it.
    const encodable: readonly OperatorId[] = [...semantics.operators, ...presenceOperators];
    const offered = [...(registered?.operators ?? semantics.operators), ...presenceOperators];

    // Restated rather than spread: `FilterField['ui']` carries an index signature, which
    // swallows `label` when the descriptor's ui is spread into a fresh object literal.
    const ui: FilterField['ui'] = {
        ...descriptor.ui,
        label: String(descriptor.ui.label),
        type: descriptor.ui.type ?? registered?.control ?? 'text'
    };

    if (ui.defaultOperator === undefined && registered?.defaultOperator) {
        ui.defaultOperator = registered.defaultOperator;
    }

    return {
        // Filtered, not substituted, so a listed operator the vocabulary cannot write is
        // dropped here rather than serializing to null and vanishing from the query.
        operators: (descriptor.operators?.filter(operator => encodable.includes(operator)) ?? offered) satisfies readonly OperatorId[],
        codec: composeCodec(addressing, semantics),
        ...(descriptor.options ? {options: descriptor.options} : {}),
        ...(descriptor.metadata ? {metadata: descriptor.metadata} : {}),
        ...(descriptor.parseKeys ? {parseKeys: descriptor.parseKeys} : {}),
        ui
    };
}


export function buildCatalogue(descriptors: readonly FieldDescriptor[]): Record<string, FilterField> {
    const catalogue: Record<string, FilterField> = {};

    for (const descriptor of descriptors) {
        catalogue[descriptor.key] = describeField(descriptor);
    }

    return catalogue;
}
