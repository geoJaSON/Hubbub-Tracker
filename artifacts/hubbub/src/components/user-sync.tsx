import { ReactNode } from "react";

// In the local-auth model, identity is established at login — no JIT sync needed.
export function UserSync({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
