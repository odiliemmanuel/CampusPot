import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { Camera, Loader2, X } from "lucide-react";

interface QrScannerProps {
  /** Called once with the decoded text (a join link or bare code). */
  onResult: (text: string) => void;
  onClose: () => void;
}

// Full-screen-ish modal that reads a QR code from the device camera using the
// rear lens. Decoding is done with jsQR on an off-screen canvas.
export default function QrScanner({ onResult, onClose }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const doneRef = useRef(false);

  // Keep the latest callback without re-starting the camera on every render.
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    function stop() {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    }

    function scan() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || cancelled || doneRef.current) return;
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        const w = video.videoWidth;
        const h = video.videoHeight;
        if (w && h) {
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (ctx) {
            ctx.drawImage(video, 0, 0, w, h);
            const image = ctx.getImageData(0, 0, w, h);
            const code = jsQR(image.data, image.width, image.height, {
              inversionAttempts: "dontInvert",
            });
            if (code?.data) {
              doneRef.current = true;
              stop();
              onResultRef.current(code.data);
              return;
            }
          }
        }
      }
      rafRef.current = requestAnimationFrame(scan);
    }

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("This browser can't open the camera. Type the code instead.");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        setReady(true);
        scan();
      } catch {
        setError("Camera access was blocked. Type the code instead.");
      }
    }

    start();
    return () => {
      cancelled = true;
      stop();
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Scan a pot's QR code"
    >
      <div className="w-full max-w-sm overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <Camera className="h-4 w-4 text-brand-600" />
            <p className="text-sm font-semibold text-slate-800">Scan to join</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close scanner"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-50 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="relative aspect-square bg-slate-900">
          <video
            ref={videoRef}
            className="h-full w-full object-cover"
            playsInline
            muted
          />
          <canvas ref={canvasRef} className="hidden" />

          {!error && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div
                className={`h-56 w-56 rounded-2xl border-2 border-white/80 ${
                  ready ? "shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" : ""
                }`}
              />
            </div>
          )}

          {!ready && !error && (
            <div className="absolute inset-0 flex items-center justify-center text-white">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          )}
        </div>

        <div className="px-5 py-4">
          {error ? (
            <p className="text-sm text-rose-600">{error}</p>
          ) : (
            <p className="text-center text-xs text-slate-500">
              Point your camera at the pot's QR code.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
