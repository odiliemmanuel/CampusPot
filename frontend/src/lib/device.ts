// Small device helpers. Phones/tablets land on the wallet by default; desktops
// open the pot list, which is the richer workspace.

export const isMobile = () =>
  typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches;

/** Where to send a signed-in user when they didn't ask for a specific page. */
export const homeRoute = () => (isMobile() ? "/account" : "/pots");
