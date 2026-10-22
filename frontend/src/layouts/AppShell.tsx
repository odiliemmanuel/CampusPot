import { useState, type ReactNode } from "react";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import MobileNav from "./MobileNav";

// Shared authenticated shell: navigation stays violet while the page canvas
// and shared surfaces follow the selected theme.
export default function AppShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-[100dvh] overflow-x-clip bg-[#F7F5FF] text-slate-900 transition-colors duration-200 dark:bg-[#0b0c14] dark:text-slate-100">
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />

      <div className="lg:pl-60">
        <Topbar onMenu={() => setMobileOpen(true)} />
        <main className="mx-auto w-full max-w-[1400px] min-w-0 p-3 pb-[calc(env(safe-area-inset-bottom)+5.5rem)] transition-colors duration-200 sm:p-5 sm:pb-28 lg:p-8 lg:pb-8">
          {children}
        </main>
      </div>

      <MobileNav />
    </div>
  );
}
