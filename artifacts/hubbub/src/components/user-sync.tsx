import { useEffect, useRef, useState, ReactNode } from "react";
import { useUser, useClerk } from "@clerk/react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export function UserSync({ children }: { children: ReactNode }) {
  const { user, isLoaded } = useUser();
  const { signOut } = useClerk();
  const synced = useRef(false);
  const [blocked, setBlocked] = useState(false);
  const [blockedEmail, setBlockedEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoaded || !user || synced.current) return;
    synced.current = true;

    fetch(`${basePath}/api/users/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: user.primaryEmailAddress?.emailAddress,
        displayName: user.fullName ?? user.username ?? user.id,
        avatarUrl: user.imageUrl,
      }),
    })
      .then(async (res) => {
        if (res.status === 403) {
          setBlockedEmail(user.primaryEmailAddress?.emailAddress ?? null);
          setBlocked(true);
        }
      })
      .catch(console.error);
  }, [isLoaded, user]);

  if (blocked) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6 font-mono">
        <div className="max-w-md w-full border border-destructive/50 bg-card p-8 space-y-4 text-center">
          <div className="text-destructive text-2xl font-['VT323'] tracking-widest">
            ACCESS DENIED
          </div>
          <div className="h-px bg-destructive/30" />
          <p className="text-sm text-muted-foreground">
            This application is restricted to{" "}
            <span className="text-foreground">@372geomedia.com</span> accounts.
          </p>
          {blockedEmail && (
            <p className="text-xs text-muted-foreground">
              Signed in as:{" "}
              <span className="text-destructive">{blockedEmail}</span>
            </p>
          )}
          <button
            onClick={() => void signOut()}
            className="mt-2 w-full border border-border text-muted-foreground hover:text-foreground hover:border-foreground py-2 text-xs tracking-widest transition-colors"
          >
            SIGN OUT
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
