import { ReactNode } from "react";
import { Sidebar, SIDEBAR_COLLAPSED_WIDTH } from "./Sidebar";
import { TopBar } from "./TopBar";

interface MainLayoutProps {
  children: ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <TopBar />
      {/* Desktop: margin-left for collapsed sidebar + top bar, Mobile: no margin */}
      <main className="lg:ml-16 pt-14 lg:pt-12">
        <div className="p-2 lg:p-3 xl:p-4">{children}</div>
      </main>
    </div>
  );
}
