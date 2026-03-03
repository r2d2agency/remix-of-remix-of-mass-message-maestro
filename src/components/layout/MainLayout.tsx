import { ReactNode } from "react";
import { Sidebar, SIDEBAR_COLLAPSED_WIDTH } from "./Sidebar";
import { TopBar } from "./TopBar";
import { MessageNotifications } from "./MessageNotifications";
import { CRMAlerts } from "./CRMAlerts";
import { ConnectionStatusIndicator } from "./ConnectionStatusIndicator";
import { GroupSecretaryPopup } from "./GroupSecretaryPopup";

interface MainLayoutProps {
  children: ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  return (
    <div className="min-h-screen bg-background overflow-hidden">
      <Sidebar />
      <TopBar />
      
      {/* Mobile TopBar with notifications */}
      <div className="lg:hidden fixed right-0 left-12 h-14 flex items-center justify-end gap-2 px-3 bg-background/95 backdrop-blur-sm border-b border-border/50 z-50" style={{ top: 'env(safe-area-inset-top, 0px)' }}>
        <ConnectionStatusIndicator />
        <div className="h-5 w-px bg-border" />
        <MessageNotifications />
        <CRMAlerts />
      </div>
      
      {/* Desktop: margin-left for collapsed sidebar + top bar, Mobile: no margin */}
      {/* Use calc to ensure content fits exactly within available space */}
      <main className="lg:ml-16 lg:pt-12 overflow-x-hidden w-full lg:w-[calc(100vw-4rem)] box-border" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 3.5rem)' }}>
        <div className="p-2 lg:p-3 xl:p-4 w-full min-w-0 overflow-x-hidden">{children}</div>
      </main>
      <GroupSecretaryPopup />
    </div>
  );
}
