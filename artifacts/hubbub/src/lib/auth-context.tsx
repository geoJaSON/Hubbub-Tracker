import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";

const STORAGE_KEY = "hubbub_auth";

export interface AuthUser {
  id: number;
  clerkId: string;
  email: string | null;
  displayName: string;
  username: string | null;
  avatarUrl: string | null;
  role: "admin" | "member";
  active: boolean;
}

interface StoredAuth {
  token: string;
  user: AuthUser;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoaded: boolean;
  isSignedIn: boolean;
  /** The string user ID (clerkId field) — kept for compatibility with existing code */
  userId: string | null;
  getToken: () => Promise<string | null>;
  signIn: (token: string, user: AuthUser) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<StoredAuth | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as StoredAuth;
        if (parsed?.token && parsed?.user) {
          setAuth(parsed);
        }
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
    setIsLoaded(true);
  }, []);

  const signIn = useCallback((token: string, user: AuthUser) => {
    const stored: StoredAuth = { token, user };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    setAuth(stored);
  }, []);

  const signOut = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setAuth(null);
  }, []);

  const getToken = useCallback(async (): Promise<string | null> => {
    return auth?.token ?? null;
  }, [auth]);

  return (
    <AuthContext.Provider
      value={{
        user: auth?.user ?? null,
        isLoaded,
        isSignedIn: auth !== null,
        userId: auth?.user.clerkId ?? null,
        getToken,
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
