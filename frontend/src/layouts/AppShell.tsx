import type { ReactNode } from "react";
import Sidebar from "./Sidebar";
import Navbar from "./Navbar";

// Wraps any authenticated page in the same shell: Sidebar always visible on the
// left (desktop) or behind a hamburger (mobile), Navbar on top. Sidebar and
// content are separate panels, matching the LearnQuest dashboard look.
export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas dark:bg-[#0b0c1a] p-4 sm:p-6 transition-colors duration-300">
      <div className="flex flex-col lg:flex-row gap-4 min-h-[92vh]">
        <div className="bg-ink rounded-[32px] lg:w-64 shrink-0 transition-colors duration-300">
          <Sidebar />
        </div>
        <main className="flex-1 overflow-auto bg-panel dark:bg-panel-dark rounded-[32px] p-4 sm:p-6 transition-colors duration-300">
          <Navbar />
          {children}
        </main>
      </div>
    </div>
  );
}
