import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { getToken, updateProfile } from "./api";

// Lightweight i18n: a dictionary per language, a t(key) lookup that falls back
// to English and then to the key itself, and a locale that persists to
// localStorage (and to the signed-in profile, best-effort). Add a language by
// adding a dictionary — every key missing from it simply falls back.
export type Locale = "en" | "fr";

export const LOCALES: { code: Locale; label: string }[] = [
  { code: "en", label: "English" },
  { code: "fr", label: "Français" },
];

const STORAGE_KEY = "campuspot_locale";

const en: Record<string, string> = {
  // Navigation
  "nav.pots": "Pots",
  "nav.balance": "Balance & History",
  "nav.settings": "Settings",
  "nav.wallet": "Wallet",
  "nav.join": "Join pot",
  "nav.notifications": "Notifications",
  // Common actions
  "common.save": "Save",
  "common.cancel": "Cancel",
  "common.loading": "Loading…",
  "common.copy": "Copy",
  "common.copied": "Copied",
  "common.close": "Close",
  // Wallet home
  "wallet.balance": "Wallet balance · NGN",
  "wallet.walletNumber": "Wallet number",
  "wallet.addMoney": "Add money",
  "wallet.send": "Send",
  "wallet.yourPots": "Your pots",
  "wallet.recentActivity": "Recent activity",
  "wallet.together": "Together",
  "wallet.seeAll": "See all",
  // Pots
  "pots.title": "Pots",
  "pots.subtitle": "Shared money, clear records, decisions made together.",
  "pots.create": "Create a pot",
  "pots.join": "Join a pot",
  "pots.discover": "Discover public pots",
  "pots.discoverHint": "Open pots anyone can join — or keep yours invite-only.",
  "pots.joined": "Open",
  "pots.joinAction": "Join",
  // Journals
  "journal.title": "Journals",
  "journal.subtitle": "One book per contribution period — open a cycle to see who paid what.",
  "journal.collected": "Collected",
  "journal.closing": "Closing balance",
  "journal.noCycles": "No cycles yet — the first journal opens when a contribution period starts.",
  // Auth
  "auth.login": "Log in",
  "auth.signup": "Sign up",
  "auth.welcomeBack": "Welcome back",
  // Verification
  "verify.title": "Verify your email",
  "verify.subtitle": "Enter the code we emailed you. It expires in 5 minutes.",
  "verify.resend": "Resend code",
  "verify.verify": "Verify",
  "verify.devHint": "Demo mode: your code is",
  // Settings
  "settings.language": "Language",
  "settings.languageHint": "Applies across the app and is saved to your profile.",
  "settings.session": "Session",
  "settings.logout": "Log out",
  // Install
  "install.app": "Install app",
};

const fr: Record<string, string> = {
  // Navigation
  "nav.pots": "Cagnottes",
  "nav.balance": "Solde et historique",
  "nav.settings": "Réglages",
  "nav.wallet": "Portefeuille",
  "nav.join": "Rejoindre",
  "nav.notifications": "Notifications",
  // Common actions
  "common.save": "Enregistrer",
  "common.cancel": "Annuler",
  "common.loading": "Chargement…",
  "common.copy": "Copier",
  "common.copied": "Copié",
  "common.close": "Fermer",
  // Wallet home
  "wallet.balance": "Solde du portefeuille · NGN",
  "wallet.walletNumber": "Numéro de portefeuille",
  "wallet.addMoney": "Ajouter",
  "wallet.send": "Envoyer",
  "wallet.yourPots": "Vos cagnottes",
  "wallet.recentActivity": "Activité récente",
  "wallet.together": " ensemble",
  "wallet.seeAll": "Tout voir",
  // Pots
  "pots.title": "Cagnottes",
  "pots.subtitle": "L'argent partagé, des comptes clairs, des décisions prises ensemble.",
  "pots.create": "Créer une cagnotte",
  "pots.join": "Rejoindre une cagnotte",
  "pots.discover": "Découvrir les cagnottes publiques",
  "pots.discoverHint": "Des cagnottes ouvertes à tous — ou gardez la vôtre sur invitation.",
  "pots.joined": "Ouvrir",
  "pots.joinAction": "Rejoindre",
  // Journals
  "journal.title": "Registres",
  "journal.subtitle": "Un registre par période — ouvrez un cycle pour voir qui a payé quoi.",
  "journal.collected": "Collecté",
  "journal.closing": "Solde de clôture",
  "journal.noCycles": "Aucun cycle pour l'instant — le premier registre s'ouvre au début d'une période.",
  // Auth
  "auth.login": "Connexion",
  "auth.signup": "S'inscrire",
  "auth.welcomeBack": "Bon retour",
  // Verification
  "verify.title": "Vérifiez votre e-mail",
  "verify.subtitle": "Saisissez le code envoyé par e-mail. Il expire dans 5 minutes.",
  "verify.resend": "Renvoyer le code",
  "verify.verify": "Vérifier",
  "verify.devHint": "Mode démo : votre code est",
  // Settings
  "settings.language": "Langue",
  "settings.languageHint": "S'applique à toute l'application et est enregistrée sur votre profil.",
  "settings.session": "Session",
  "settings.logout": "Se déconnecter",
  // Install
  "install.app": "Installer l'app",
};

const dictionaries: Record<Locale, Record<string, string>> = { en, fr };

interface I18nValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string) => string;
}

const I18nContext = createContext<I18nValue>({
  locale: "en",
  setLocale: () => {},
  t: (key) => key,
});

function readStoredLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "fr" || stored === "en") return stored;
  } catch {
    /* storage unavailable */
  }
  return "en";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(readStoredLocale);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage unavailable */
    }
    // Keep the signed-in profile in sync (best-effort — the app works even
    // if the request fails; the local preference still applies).
    if (getToken()) {
      updateProfile({ locale: next }).catch(() => {});
    }
  }, []);

  const t = useCallback(
    (key: string) => dictionaries[locale][key] ?? dictionaries.en[key] ?? key,
    [locale]
  );

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  return useContext(I18nContext);
}
