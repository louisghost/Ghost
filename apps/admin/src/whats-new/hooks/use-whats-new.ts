import { useEffect } from "react";
import { useQuery, useMutation, type UseQueryResult, type UseMutationResult } from "@tanstack/react-query";

import {
    useUserPreferences,
    useEditUserPreferences,
    type Preferences,
    type WhatsNewPreferences,
} from "@/hooks/user-preferences";
import { useChangelog, type ChangelogEntry } from "./use-changelog";

function getDefaultWhatsNewPreferences(): WhatsNewPreferences {
    return {
        lastSeenDate: new Date(),
    };
}

interface WhatsNewData {
    hasNew: boolean;
}

const whatsNewQueryKey = (preferences: Preferences | undefined, latestEntry: ChangelogEntry | undefined) =>
    ["whatsNew", preferences?.whatsNew?.lastSeenDate?.toISOString(), latestEntry?.publishedAt.toISOString()] as const;

/**
 * Stores today as the last seen date for a user who has none, so entries
 * published before they arrived never read as new.
 *
 * Belongs to a single caller (the admin layout). Reading hooks must not do this:
 * every mounted consumer would queue its own write of the whole preferences blob.
 */
export const useInitializeWhatsNewPreferences = (): void => {
    const { data: preferences, isSuccess: isPreferencesLoaded } = useUserPreferences();
    const { mutateAsync: updatePreferences } = useEditUserPreferences();

    const hasWhatsNewPreferences = !!preferences?.whatsNew?.lastSeenDate;

    useEffect(() => {
        if (!hasWhatsNewPreferences && isPreferencesLoaded) {
            void updatePreferences({
                whatsNew: getDefaultWhatsNewPreferences(),
            });
        }
    }, [hasWhatsNewPreferences, isPreferencesLoaded, updatePreferences]);
};

export const useWhatsNew = (): UseQueryResult<WhatsNewData> => {
    const { data: preferences } = useUserPreferences();
    const { data: changelog, isSuccess: isChangelogLoaded } = useChangelog();

    const hasWhatsNewPreferences = !!preferences?.whatsNew?.lastSeenDate;

    const latestEntry = changelog?.entries[0];

    return useQuery({
        queryKey: whatsNewQueryKey(preferences, latestEntry),
        queryFn: () => {
            if (!latestEntry) {
                return { hasNew: false };
            }

            // Safe to assert non-null because query is only enabled when hasWhatsNewPreferences is true,
            // and useInitializeWhatsNewPreferences stores a valid lastSeenDate
            const lastSeenDate = preferences!.whatsNew!.lastSeenDate!;

            const hasNew = latestEntry.publishedAt > lastSeenDate;

            return { hasNew };
        },
        enabled: isChangelogLoaded && hasWhatsNewPreferences,
        staleTime: Infinity,
        gcTime: 0,
    });
};

export const useDismissWhatsNew = (): UseMutationResult<void, Error, void, unknown> => {
    const { data: changelog } = useChangelog();
    const { mutateAsync: updatePreferences } = useEditUserPreferences();

    return useMutation({
        mutationFn: async () => {
            const latestEntry = changelog?.entries[0];

            if (!latestEntry) {
                return;
            }

            const newPreferences: WhatsNewPreferences = {
                lastSeenDate: latestEntry.publishedAt,
            };

            await updatePreferences({
                whatsNew: newPreferences,
            });
        },
    });
};
