import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Check, Copy, QrCode, Share2 } from "lucide-react";
import { joinLink } from "../lib/join";

// The "how do people get in" panel: a big join code, a QR to scan, and
// copy/share buttons. Shown on the Members page for everyone to see.
export default function JoinCard({ code }: { code: string }) {
  const link = joinLink(code);
  const [copied, setCopied] = useState<"code" | "link" | "">("");

  const copy = async (value: string, which: "code" | "link") => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(which);
      setTimeout(() => setCopied(""), 1800);
    } catch {
      // Clipboard unavailable (e.g. insecure context) — the code is still shown.
    }
  };

  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Join the pot on CampusPot",
          text: `Join our pot on CampusPot with code ${code}`,
          url: link,
        });
      } catch {
        // User dismissed the share sheet.
      }
    } else {
      copy(link, "link");
    }
  };

  return (
    <div className="rounded-3xl bg-gradient-to-br from-brand-600 to-brand-800 p-6 text-white relative overflow-hidden">
      <div className="absolute -top-8 -right-8 h-40 w-40 rounded-full bg-white/10 blur-2xl" />

      <div className="relative">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand-100">
          <QrCode className="h-3.5 w-3.5" /> Share this to join
        </p>

        <div className="mt-4 flex items-center gap-4">
          <div className="shrink-0 rounded-2xl bg-white p-2.5">
            <QRCodeSVG value={link} size={104} level="M" marginSize={0} />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-brand-100">Join code</p>
            <p className="font-sora text-3xl font-extrabold tracking-widest">{code}</p>
            <p className="mt-1 text-[11px] text-brand-100">
              Others enter the code, scan the QR, or open your link.
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => copy(code, "code")}
            className="inline-flex items-center gap-2 rounded-xl bg-white/15 px-4 py-2 text-sm font-semibold backdrop-blur transition hover:bg-white/25"
          >
            {copied === "code" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied === "code" ? "Copied" : "Copy code"}
          </button>
          <button
            type="button"
            onClick={() => copy(link, "link")}
            className="inline-flex items-center gap-2 rounded-xl bg-white/15 px-4 py-2 text-sm font-semibold backdrop-blur transition hover:bg-white/25"
          >
            {copied === "link" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied === "link" ? "Copied" : "Copy link"}
          </button>
          <button
            type="button"
            onClick={share}
            className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-bold text-brand-700 transition hover:bg-brand-50"
          >
            <Share2 className="h-4 w-4" /> Share
          </button>
        </div>

        <p className="mt-4 truncate text-[11px] text-brand-100">{link}</p>
      </div>
    </div>
  );
}
