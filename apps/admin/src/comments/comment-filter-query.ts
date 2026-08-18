import {type AstNode, type FilterPredicate, type ParsedPredicate, dispatchSimpleNodes, getFieldKeysByType, hasFieldKey, parseFilterToAst, resolveField, serializePredicates, stampPredicates} from '@/shared/filters';
import {buildCommentFields} from './comment-filter-catalogue';

const TIMEZONE_SENSITIVE_COMMENT_FIELDS = getFieldKeysByType(buildCommentFields(), 'date');

function isPredicateEnabled(predicate: ParsedPredicate): boolean {
    const resolved = resolveField(buildCommentFields(), predicate.field, 'UTC');
    return resolved?.definition.operators.some(operator => operator === predicate.operator) ?? false;
}

function parseCommentNode(node: AstNode, timezone: string): ParsedPredicate[] {
    if (Array.isArray(node.$and)) {
        return (node.$and as AstNode[]).flatMap(child => parseCommentNode(child, timezone));
    }

    return dispatchSimpleNodes([node], buildCommentFields(), timezone);
}

export function parseCommentFilter(filter: string | undefined, timezone: string): FilterPredicate[] {
    const ast = parseFilterToAst(filter ?? '');

    if (!ast) {
        return [];
    }

    return stampPredicates(parseCommentNode(ast, timezone).filter(isPredicateEnabled));
}

export function hasTimezoneSensitiveCommentFilter(filter: string | undefined): boolean {
    const ast = parseFilterToAst(filter ?? '');

    if (!ast) {
        return false;
    }

    return hasFieldKey(ast, TIMEZONE_SENSITIVE_COMMENT_FIELDS);
}

export function serializeCommentFilters(predicates: FilterPredicate[], timezone: string): string | undefined {
    return serializePredicates(predicates.filter(isPredicateEnabled), buildCommentFields(), timezone);
}
