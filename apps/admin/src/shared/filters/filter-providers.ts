import {FILTER_TYPES} from './filter-registry';
import {columnAddressing, composeCodec} from './filter-addressing';
import type {FieldAddressing, PlainAddressing, PresenceAddressing} from './filter-addressing';
import type {ConfigOf, FilterTypeFacts, FilterTypeId} from './filter-registry';
import type {FilterField} from './filter-types';
import type {ValueSemantics} from './semantics';
import type {OperatorId, PresenceOperator} from './filter-operators';



/**
 * The icon a field is drawn with, named rather than supplied. A descriptor stays data, and the
 * mapping from these names to elements is total, so a new name has to be drawn before it builds.
 */
export type FieldIcon =
    | 'arrows' | 'calendar' | 'calendar-clock' | 'calendar-end' | 'calendar-start' | 'card'
    | 'click' | 'eye' | 'layers' | 'mail' | 'mail-open' | 'message' | 'newspaper' | 'percent'
    | 'person' | 'person-circle' | 'person-plus' | 'send' | 'tag' | 'ticket' | 'text';

interface FieldDescriptorBase {
    key: string;
    /** Drawn beside the field in the picker. Declared here so it cannot be forgotten elsewhere. */
    icon: FieldIcon;
    /** Where the value lives. Defaults to a column of the same name. */
    addressing?: FieldAddressing;
    ui: Omit<FilterField['ui'], 'type'> & {type?: FilterField['ui']['type']};
    options?: FilterField['options'];
    metadata?: FilterField['metadata'];
    parseKeys?: readonly string[];
}

/**
 * Distributed over `FilterTypeId` so a config is described per type.
 *
 * The check is weaker than it looks: a type whose semantics factory takes no parameter has
 * `ConfigOf` of `undefined`, and a config handed to one of those is accepted and then ignored.
 * Only a type that does take config gets its shape checked.
 */
/**
 * Everything a type's vocabulary can write, plus whatever an addressing can ask about presence.
 * Taken from the vocabulary rather than the type's offered list: a type offers a subset for
 * taste — a timestamp does not offer the relative pair — and a field may opt back into anything
 * the vocabulary can actually express.
 */
type WritableBy<TType extends FilterTypeId> =
    ReturnType<typeof FILTER_TYPES[TType]['semantics']>['operators'][number];

type TypeSpecific<TType extends FilterTypeId> = {
    type: TType;
    valueConfig?: ConfigOf<TType>;
    /**
     * Opts into "in the last N days" or "in the next N days". Only a moment in time can be
     * asked this, and only some are worth asking it of — a signup date looks back, a renewal
     * date looks forward — so it is the field's to declare, not the type's.
     */
    relative?: TType extends 'timestamp' | 'plain_date' ? 'past' | 'future' : never;
};

/**
 * A field naming a registered type, split on what its addressing can answer. Operators cannot
 * widen: one outside the union has no expression, so listing it is rejected here rather than
 * dropped when the catalog is built and silently missing from the picker. Presence is only in
 * the union for a relation — a column is always set, so it cannot be asked whether it is.
 */
type TypedFieldDescriptor = {
    [TType in FilterTypeId]:
        | (FieldDescriptorBase & TypeSpecific<TType> & {
            addressing?: PlainAddressing;
            operators?: readonly WritableBy<TType>[];
        })
        | (FieldDescriptorBase & TypeSpecific<TType> & {
            addressing: PresenceAddressing;
            operators?: readonly (WritableBy<TType> | PresenceOperator)[];
        })
}[FilterTypeId];

/** A field whose vocabulary is defined by its own domain rather than named in the registry. */
/**
 * A field whose vocabulary is its own domain's rather than one the registry names. Generic over
 * that vocabulary so its operators are checked the same way a named type's are: what the
 * vocabulary can write, plus presence when the addressing can answer it.
 */
interface DomainFieldDescriptor<TOperator extends OperatorId = OperatorId> extends FieldDescriptorBase {
    type?: undefined;
    valueConfig?: undefined;
    semantics: ValueSemantics<TOperator>;
    operators?: readonly (TOperator | PresenceOperator)[];
    /** Relative dates belong to a named date type; a domain vocabulary declares its own. */
    relative?: undefined;
}

/**
 * Declares a field whose vocabulary is its own domain's. Written through a function because an
 * object literal has nowhere to infer the vocabulary from, which is what left these operators
 * unchecked: `NoInfer` fixes the operator set from the semantics alone and checks the list
 * against it, exactly as a registered type's are checked.
 */
type DomainFieldCommon<TKey extends string, TOperator extends OperatorId> = {
    key: TKey;
    icon: FieldIcon;
    semantics: ValueSemantics<TOperator>;
    ui: FieldDescriptorBase['ui'];
    options?: FieldDescriptorBase['options'];
    metadata?: FieldDescriptorBase['metadata'];
    parseKeys?: readonly string[];
};

export function domainField<const TKey extends string, TOperator extends OperatorId>(descriptor:
    | (DomainFieldCommon<TKey, TOperator> & {
        addressing?: PlainAddressing;
        operators?: readonly NoInfer<TOperator>[];
    })
    | (DomainFieldCommon<TKey, TOperator> & {
        addressing: PresenceAddressing;
        operators?: readonly (NoInfer<TOperator> | PresenceOperator)[];
    })
): DomainFieldDescriptor<TOperator> & {key: TKey} {
    return descriptor;
}

export type FieldDescriptor =
    | TypedFieldDescriptor
    | DomainFieldDescriptor<OperatorId>;


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
        icon: descriptor.icon,
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
        ...(registered?.labels ? {operatorLabels: registered.labels} : {}),
        ...(descriptor.options ? {options: descriptor.options} : {}),
        ...(descriptor.metadata ? {metadata: descriptor.metadata} : {}),
        ...(descriptor.parseKeys ? {parseKeys: descriptor.parseKeys} : {}),
        ui
    };
}


export function buildCatalog(descriptors: readonly FieldDescriptor[]): Record<string, FilterField> {
    const catalog: Record<string, FilterField> = {};

    for (const descriptor of descriptors) {
        catalog[descriptor.key] = describeField(descriptor);
    }

    return catalog;
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
export function buildProvidedCatalog(providers: readonly FieldProvider[]): Record<string, FilterField> {
    return buildCatalog(providers.flatMap(provider => provider.fields));
}

/**
 * Whether this filter can be read as precisely as it will ever be read.
 *
 * Read off the raw string, because deciding whether to wait cannot itself require parsing. A
 * filter naming no unresolved provider's clauses never waits — and one that does still parses
 * through the fallback entry, so waiting protects precision rather than preventing loss.
 */
export function catalogCanRead(filter: string | undefined, providers: readonly FieldProvider[]): boolean {
    if (!filter) {
        return true;
    }

    return providers.every(provider => provider.resolved
        || !(provider.claims ?? []).some(claim => filter.includes(claim)));
}
