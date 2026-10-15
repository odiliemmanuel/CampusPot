import { Bell, Sun, Moon, ShieldCheck } from "lucide-react";
import { useTheme } from "next-themes";

export default function Navbar() {
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <div className="flex items-center justify-between mb-7 gap-4">
      <div className="hidden sm:flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 max-w-xs transition-colors">
        <ShieldCheck className="w-4 h-4 text-emerald-500" />
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
          Sandbox · synthetic data only
        </span>
      </div>

      <div className="flex items-center gap-3 ml-auto">
        <button
          onClick={() => setTheme(isDark ? "light" : "dark")}
          className="w-10 h-10 rounded-xl flex items-center justify-center bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-amber-300 hover:bg-primary-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
          aria-label="Toggle dark mode"
        >
          {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        <button
          className="w-10 h-10 rounded-xl flex items-center justify-center relative bg-slate-50 dark:bg-slate-800 hover:bg-primary-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
          aria-label="Notifications"
        >
          <Bell className="w-4 h-4 text-slate-500 dark:text-slate-400" />
          <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-rose-500" />
        </button>
      </div>
    </div>
  );
}
