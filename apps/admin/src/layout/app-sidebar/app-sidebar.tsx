import React from "react"

import {Sidebar} from "@tryghost/shade/components"

import { useInitializeWhatsNewPreferences } from "@/whats-new/hooks/use-whats-new";

import AppSidebarHeader from "./app-sidebar-header";
import AppSidebarFooter from "./app-sidebar-footer";
import AppSidebarContent from "./app-sidebar-content";

function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
    // The sidebar holds every What's New reader, and owns the write that seeds
    // what they read, so no reader queues one of its own.
    useInitializeWhatsNewPreferences();

    return (
        <Sidebar data-testid="admin-sidebar" {...props}>
            <AppSidebarHeader className="px-5 pt-5 pb-0" />
            <AppSidebarContent />
            <AppSidebarFooter className="gap-0 p-3" />
        </Sidebar>
    )
}

export default AppSidebar;
