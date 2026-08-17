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

/**
 * Where a set of fields comes from.
 *
 * A provider that knows its fields at build time and one that only knows them after a fetch
 * make the same statement; the difference is `resolved`, and what depends on it is whether a
 * filter naming those fields can be read yet.
 */
export interface FieldProvider {
    resolved: boolean;
    /**
     * NQL key prefixes whose clauses this provider's fields interpret more precisely than the
     * fallback entry does. A filter naming one is readable either way — as text through the
     * fallback, or as its real type once resolved — so this decides whether to wait, not
     * whether it parses.
     */
    claims?: readonly string[];
    fields: readonly FieldDescriptor[];
}

/** Every provider's fields, in order. Later providers win a key clash, so fallbacks go first. */
export function buildProvidedCatalogue(providers: readonly FieldProvider[]): Record<string, FilterField> {
    return buildCatalogue(providers.flatMap(provider => provider.fields));
}

/**
 * Whether this filter can be read as precisely as it will ever be read.
 *
 * Read off the raw string, because deciding whether to wait cannot itself require parsing. A
 * filter naming no unresolved provider's clauses never waits — and one that does still parses
 * through the fallback entry, so waiting protects precision rather than preventing loss.
 */
export function catalogueCanRead(filter: string | undefined, providers: readonly FieldProvider[]): boolean {
    if (!filter) {
        return true;
    }

    return providers.every(provider => provider.resolved
        || !(provider.claims ?? []).some(claim => filter.includes(claim)));
}
