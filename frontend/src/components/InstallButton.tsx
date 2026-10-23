import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Download, Share, Plus, X } from "lucide-react";

// The browser fires this event when the page is installable as a PWA. It is
// not in the standard TypeScript DOM types yet, so we declare the two fields
// we actually use.
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "campuspot_install_dismissed";

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
  // iOS Safari exposes navigator.standalone instead of the media query.
  return (window.navigator as { standalone?: boolean }).standalone === true;
}

// iPhones/iPads never fire beforeinstallprompt — they install via the Share
// sheet — so they get the button with step-by-step instructions instead.
function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function dismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Floating "Install app" button, shown only while PotKeeper is being used in a
 * browser tab. It disappears once the app is installed, when it is already
 * running standalone, or when the user dismisses it. Chrome/Android install
 * straight from the captured prompt; iOS Safari gets Share → Add to Home
 * Screen instructions since Apple exposes no install prompt.
 */
export default function InstallButton() {
  const [visible, setVisible] = useState(false);
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    if (isStandalone() || dismissed()) return;

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
      setVisible(true);
    };
    const onInstalled = () => {
      setVisible(false);
      setShowHelp(false);
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);

    // iOS never fires beforeinstallprompt, but the button is still useful
    // there because it explains how to install from the browser.
    if (isIOS()) setVisible(true);

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = async () => {
    if (!prompt) {
      setShowHelp(true);
      return;
    }
    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice.outcome === "accepted") setVisible(false);
    // On dismissal the button stays so the user can retry later.
  };

  const dismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* storage unavailable — hide for this session only */
    }
  };

  return (
    <>
      <AnimatePresence>
        {visible && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            className="fixed bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] right-3 z-40 flex items-center gap-1 sm:bottom-6 sm:right-6"
          >
            <button
              type="button"
              onClick={install}
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-violet-600 to-purple-800 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-900/30 transition active:scale-95"
            >
              <Download className="h-4 w-4" />
              Install app
            </button>
            <button
              type="button"
              onClick={dismiss}
              aria-label="Dismiss install button"
              className="grid h-8 w-8 place-items-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:text-slate-700 dark:border-white/10 dark:bg-panel-dark dark:text-slate-300"
            >
              <X className="h-4 w-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* iOS has no install prompt, so show the manual steps instead. */}
      <AnimatePresence>
        {showHelp && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-3 backdrop-blur-sm sm:items-center"
            onClick={() => setShowHelp(false)}
          >
            <motion.div
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 24, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl dark:bg-panel-dark"
              role="dialog"
              aria-label="Install PotKeeper"
            >
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-sora text-lg font-bold text-slate-900 dark:text-white">Install PotKeeper</h2>
                <button
                  type="button"
                  onClick={() => setShowHelp(false)}
                  aria-label="Close"
                  className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 dark:hover:bg-white/10"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <ol className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
                <li className="flex items-start gap-2.5">
                  <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">
                    <Share className="h-3.5 w-3.5" />
                  </span>
                  Tap the <span className="font-semibold">Share</span> button in your browser.
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">
                    <Plus className="h-3.5 w-3.5" />
                  </span>
                  Choose <span className="font-semibold">Add to Home Screen</span>.
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">
                    <Download className="h-3.5 w-3.5" />
                  </span>
                  Tap <span className="font-semibold">Add</span> — PotKeeper opens like a normal app.
                </li>
              </ol>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
