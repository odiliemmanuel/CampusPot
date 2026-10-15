import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { clearSession, getToken, listGroups, type Group } from "../lib/api";

const ACTIVE_GROUP_KEY = "campuspot_active_group";

interface GroupContextValue {
  groups: Group[];
  activeGroup: Group | null;
  loading: boolean;
  error: string;
  setActiveGroup: (g: Group | null) => void;
  setActiveGroupById: (id: string) => void;
  refresh: () => Promise<void>;
}

const GroupContext = createContext<GroupContextValue | undefined>(undefined);

export function GroupProvider({ children }: { children: ReactNode }) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [activeId, setActiveId] = useState<string | null>(
    localStorage.getItem(ACTIVE_GROUP_KEY)
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setGroups([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const list = await listGroups();
      setGroups(list);
      // Keep a valid selection: fall back to the first group we belong to.
      setActiveId((current) => {
        const stillThere = list.find((g) => g.id === current);
        const next = stillThere?.id ?? list[0]?.id ?? null;
        if (next) localStorage.setItem(ACTIVE_GROUP_KEY, next);
        else localStorage.removeItem(ACTIVE_GROUP_KEY);
        return next;
      });
    } catch (err) {
      // A dead token should drop the session rather than loop on errors.
      if (err instanceof Error && (err as { status?: number }).status === 401) {
        clearSession();
      }
      setError(err instanceof Error ? err.message : "Couldn't load your groups.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const setActiveGroup = useCallback((g: Group | null) => {
    setActiveId(g?.id ?? null);
    if (g) localStorage.setItem(ACTIVE_GROUP_KEY, g.id);
    else localStorage.removeItem(ACTIVE_GROUP_KEY);
  }, []);

  const setActiveGroupById = useCallback((id: string) => {
    setActiveId(id);
    localStorage.setItem(ACTIVE_GROUP_KEY, id);
  }, []);

  const activeGroup = groups.find((g) => g.id === activeId) ?? null;

  return (
    <GroupContext.Provider
      value={{ groups, activeGroup, loading, error, setActiveGroup, setActiveGroupById, refresh }}
    >
      {children}
    </GroupContext.Provider>
  );
}

export function useGroup(): GroupContextValue {
  const ctx = useContext(GroupContext);
  if (!ctx) throw new Error("useGroup must be used inside <GroupProvider>");
  return ctx;
}

/** The current user's role in a group, or null. */
export function roleIn(groupId: string, memberships: { groupId: string; userId: string; role: string }[], userId?: string) {
  if (!userId) return null;
  const m = memberships.find((m) => m.groupId === groupId && m.userId === userId);
  return (m?.role as "treasurer" | "cosigner" | "member") ?? null;
}
