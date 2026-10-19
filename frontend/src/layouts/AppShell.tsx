import { useState, type ReactNode } from "react";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import MobileNav from "./MobileNav";

// Shared authenticated shell: a fixed royal-blue Sidebar on desktop (drawer on
// mobile), a white Topbar, and the page content on a light grey-blue canvas.
export default function AppShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#F7F5FF] text-slate-900">
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />

      <div className="lg:pl-60">
        <Topbar onMenu={() => setMobileOpen(true)} />
        <main className="mx-auto max-w-[1400px] p-4 pb-28 sm:p-6 sm:pb-28 lg:p-8 lg:pb-8">
          {children}
        </main>
      </div>

      <MobileNav />
    </div>
  );
}
