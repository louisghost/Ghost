import {memberFields} from './member-fields';
import {type AstNode, type FilterPredicate, type ParsedPredicate, dispatchCompoundNode, dispatchSimpleNodes, getCompoundChildren, getFieldKeysByType, hasFieldKey, parseFilterToAst, resolveField, serializePredicates, stampPredicates} from '@/shared/filters';
import type {MemberFields} from './member-fields';

const TIMEZONE_SENSITIVE_MEMBER_FIELDS = getFieldKeysByType(memberFields, 'date');

/**
 * Is this predicate's operator one the field currently advertises?
 *
 * This returns `false` for predicates the user can't reach in the UI because
 * the field never declares the operator. Hooks call this to drop unreachable
 * predicates before serializing or after parsing. The parser/serializer
 * themselves stay pure.
 */
export function isPredicateEnabled(predicate: ParsedPredicate, fields: MemberFields = memberFields): boolean {
    const resolved = resolveField(fields, predicate.field, 'UTC');
    return resolved?.definition.operators.some(operator => operator === predicate.operator) ?? false;
}

function getCompound(node: AstNode): {operator: '$and' | '$or'; children: AstNode[]} | null {
    for (const operator of ['$and', '$or'] as const) {
        const children = getCompoundChildren(node, operator);

        if (children) {
            return {operator, children};
        }
    }

    return null;
}

function parseMemberNode(node: AstNode, timezone: string, fields: MemberFields = memberFields): ParsedPredicate[] {
    const addressed = dispatchCompoundNode(node, fields, timezone);

    if (addressed) {
        return [addressed];
    }

    const compound = getCompound(node);

    if (compound?.operator === '$and') {
        return compound.children.flatMap(child => parseMemberNode(child, timezone, fields));
    }

    return dispatchSimpleNodes([node], fields, timezone);
}

/**
 * Parses NQL into predicates. Pure: callers are responsible for filtering the
 * output via `isPredicateEnabled` against the field map they want to enforce.
 */
export function parseMemberFilter(filter: string | undefined, timezone: string, fields: MemberFields = memberFields): FilterPredicate[] {
    const ast = parseFilterToAst(filter ?? '');

    if (!ast) {
        return [];
    }

    return stampPredicates(parseMemberNode(ast, timezone, fields));
}

export function hasTimezoneSensitiveMemberFilter(filter: string | undefined): boolean {
    const ast = parseFilterToAst(filter ?? '');

    if (!ast) {
        return false;
    }

    return hasFieldKey(ast, TIMEZONE_SENSITIVE_MEMBER_FIELDS);
}

/**
 * Serializes predicates back to NQL. Pure: callers should pre-filter via
 * `isPredicateEnabled` if they need to drop predicates the field map doesn't
 * advertise.
 */
export function serializeMemberFilters(predicates: FilterPredicate[], timezone: string, fields: MemberFields = memberFields): string | undefined {
    return serializePredicates(predicates, fields, timezone);
}
