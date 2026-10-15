// Helpers for the code / QR / link join flow.

// The backend's join code alphabet (no I, O, 0 or 1 to avoid confusion).
const JOIN_ALPHABET = /[^ABCDEFGHJKLMNPQRSTUVWXYZ23456789]/g;

/**
 * Normalise whatever the user scanned or typed into a join code.
 * Accepts a full join URL (e.g. https://app/join/NQ6Z8N), a path, or a bare code.
 */
export function extractJoinCode(raw: string): string {
  const text = raw.trim();
  try {
    const url = new URL(text);
    const parts = url.pathname.split("/").filter(Boolean);
    const idx = parts.indexOf("join");
    if (idx >= 0 && parts[idx + 1]) return parts[idx + 1].toUpperCase();
  } catch {
    // Not a URL — fall through and treat it as a bare code.
  }
  return text.toUpperCase().replace(JOIN_ALPHABET, "");
}

/** The shareable join link for a pot, based on the current site origin. */
export function joinLink(code: string): string {
  return `${window.location.origin}/join/${code.toUpperCase()}`;
}
