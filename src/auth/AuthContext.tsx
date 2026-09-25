import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";

interface AuthState { session: Session | null; loading: boolean; isAdmin: boolean; signOut: () => Promise<void>; }
const AuthContext = createContext<AuthState | undefined>(undefined);

export function SessionContextProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const checkAccess = async (nextSession: Session | null) => {
      setSession(nextSession);
      if (!nextSession) { setIsAdmin(false); setLoading(false); return; }
      const { data } = await supabase.from("admin_users").select("user_id").eq("user_id", nextSession.user.id).maybeSingle();
      setIsAdmin(Boolean(data));
      setLoading(false);
    };
    void supabase.auth.getSession().then(({ data }) => checkAccess(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => { void checkAccess(nextSession); });
    return () => data.subscription.unsubscribe();
  }, []);

  const value = useMemo(() => ({ session, loading, isAdmin, signOut: async () => { await supabase.auth.signOut(); setIsAdmin(false); } }), [session, loading, isAdmin]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("Auth context is unavailable");
  return value;
}
