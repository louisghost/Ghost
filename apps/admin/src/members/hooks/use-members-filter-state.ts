import {type Filter} from '@tryghost/shade/patterns';
import {buildMemberFields, canReadMemberFilter} from '@/members/member-filter-catalogue';
import {hasTimezoneSensitiveMemberFilter, isPredicateEnabled, parseMemberFilter, serializeMemberFilters} from '@/members/member-filter-query';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useSearchParams} from 'react-router';
import type {CustomFieldDefinition} from '@/members/custom-field-filter-fields';
import type {MemberFields} from '@/members/member-filter-catalogue';
import type {NewsletterDefinition} from '@/members/newsletter-filter-fields';

interface SetFiltersOptions {
    replace?: boolean;
}

interface UseMembersFilterStateReturn {
    filters: Filter[];
    nql: string | undefined;
    search: string;
    setFilters: (filters: Filter[], options?: SetFiltersOptions) => void;
    setSearch: (search: string, options?: SetFiltersOptions) => void;
    clearFilters: (options?: SetFiltersOptions) => void;
    clearAll: (options?: SetFiltersOptions) => void;
    hasFilterOrSearch: boolean;
}

interface ToSearchParamsOptions {
    baseSearchParams: URLSearchParams;
    filters: Filter[];
    search: string;
    timezone: string;
    fields: MemberFields;
}

/**
 * Should the page hold off parsing the URL filter until more data is in?
 *
 * Parsing a date-sensitive filter needs the timezone from settings. If we parse
 * before it resolves, the writeback effect can round-trip the date in UTC
 * instead of site time.
 */
export function shouldDelayMembersDateFilterHydration(
    filterParam: string | undefined,
    hasResolvedDependencies: boolean,
    isLoadingDependencies: boolean = !hasResolvedDependencies
): boolean {
    return Boolean(filterParam) && isLoadingDependencies && !hasResolvedDependencies && hasTimezoneSensitiveMemberFilter(filterParam);
}

function getEnabledFilters(filters: Filter[], fields: MemberFields): Filter[] {
    return filters.filter(predicate => isPredicateEnabled(predicate, fields));
}

function toSearchParams({baseSearchParams, filters, search, timezone, fields}: ToSearchParamsOptions): URLSearchParams {
    const params = new URLSearchParams(baseSearchParams);
    const filter = serializeMemberFilters(getEnabledFilters(filters, fields), timezone, fields);

    params.delete('filter');
    params.delete('search');

    if (filter) {
        params.set('filter', filter);
    }

    if (search) {
        params.set('search', search);
    }

    return params;
}

/**
 * `newsletters` and `customFields` decide how precisely their own clauses are read — without a
 * custom field's type, a date field's filter is read as text. Both are passed in rather than
 * fetched here, so the hook keeps no hidden data dependency.
 *
 * `undefined` means not loaded and an empty array means none. A filter naming a source still in
 * flight is still parsed, through the catalogue's parameterised entries; what waits is writing
 * it back, so a saved segment is never rewritten less precisely than it was written.
 */
export function useMembersFilterState(
    timezone: string,
    newsletters?: readonly NewsletterDefinition[],
    customFields?: readonly CustomFieldDefinition[]
): UseMembersFilterStateReturn {
    const fields = useMemo(() => buildMemberFields({newsletters, customFields}), [newsletters, customFields]);
    const [searchParams, setSearchParams] = useSearchParams();
    const lastWrittenQueryRef = useRef<string | null>(null);
    const filterParam = useMemo(() => searchParams.get('filter') ?? undefined, [searchParams]);
    // Whether the filter can be read as precisely as it eventually will be. Only the write-back
    // waits on it; parsing and querying happen regardless.
    const canRead = useMemo(() => canReadMemberFilter(filterParam, {newsletters, customFields}), [filterParam, newsletters, customFields]);
    const currentQuery = useMemo(() => searchParams.toString(), [searchParams]);

    const parsedFilters = useMemo(() => {
        return getEnabledFilters(parseMemberFilter(filterParam, timezone, fields), fields);
    }, [filterParam, timezone, fields]);
    const [filters, setDraftFilters] = useState<Filter[]>(parsedFilters);

    const search = useMemo(() => {
        return searchParams.get('search') ?? '';
    }, [searchParams]);

    const nql = useMemo(() => {
        return serializeMemberFilters(getEnabledFilters(filters, fields), timezone, fields);
    }, [filters, timezone, fields]);

    useEffect(() => {
        if (currentQuery !== lastWrittenQueryRef.current) {
            setDraftFilters(parsedFilters);
            lastWrittenQueryRef.current = currentQuery;
        }
    }, [currentQuery, parsedFilters]);

    useEffect(() => {
        // Never rewrite a filter we can still read more precisely in a moment: doing so would
        // persist the less precise reading over what the publisher actually saved.
        if (!canRead) {
            return;
        }

        if (lastWrittenQueryRef.current !== null && currentQuery !== lastWrittenQueryRef.current) {
            return;
        }

        const nextParams = toSearchParams({
            baseSearchParams: searchParams,
            filters,
            search,
            timezone,
            fields
        });
        const nextQuery = nextParams.toString();

        if (nextQuery !== currentQuery) {
            lastWrittenQueryRef.current = nextQuery;
            setSearchParams(nextParams, {replace: true});
        }
    }, [canRead, currentQuery, filters, search, searchParams, setSearchParams, timezone, fields]);

    const setFilters = useCallback((nextFilters: Filter[], setOptions: SetFiltersOptions = {}) => {
        const replace = setOptions.replace ?? true;
        const nextParams = toSearchParams({
            baseSearchParams: searchParams,
            filters: nextFilters,
            search,
            timezone,
            fields
        });

        setDraftFilters(nextFilters);
        lastWrittenQueryRef.current = nextParams.toString();
        setSearchParams(nextParams, {replace});
    }, [search, searchParams, setSearchParams, timezone, fields]);

    const setSearch = useCallback((nextSearch: string, setOptions: SetFiltersOptions = {}) => {
        const replace = setOptions.replace ?? true;
        const nextParams = toSearchParams({
            baseSearchParams: searchParams,
            filters,
            search: nextSearch,
            timezone,
            fields
        });

        lastWrittenQueryRef.current = nextParams.toString();
        setSearchParams(nextParams, {replace});
    }, [filters, searchParams, setSearchParams, timezone, fields]);

    const clearFilters = useCallback(({replace = true}: SetFiltersOptions = {}) => {
        const nextParams = toSearchParams({
            baseSearchParams: searchParams,
            filters: [],
            search,
            timezone,
            fields
        });

        setDraftFilters([]);
        lastWrittenQueryRef.current = nextParams.toString();
        setSearchParams(nextParams, {replace});
    }, [search, searchParams, setSearchParams, timezone, fields]);

    const clearAll = useCallback(({replace = true}: SetFiltersOptions = {}) => {
        const nextParams = toSearchParams({
            baseSearchParams: searchParams,
            filters: [],
            search: '',
            timezone,
            fields
        });

        setDraftFilters([]);
        lastWrittenQueryRef.current = nextParams.toString();
        setSearchParams(nextParams, {replace});
    }, [searchParams, setSearchParams, timezone, fields]);

    return {
        filters,
        nql,
        search,
        setFilters,
        setSearch,
        clearFilters,
        clearAll,
        hasFilterOrSearch: Boolean(nql) || search.length > 0
    };
}
