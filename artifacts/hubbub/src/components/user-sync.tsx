import { useEffect, useRef, ReactNode } from "react";
import { useUser } from "@clerk/react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export function UserSync({ children }: { children: ReactNode }) {
  const { user, isLoaded } = useUser();
  const synced = useRef(false);

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
    }).catch(console.error);
  }, [isLoaded, user]);

  return <>{children}</>;
}
