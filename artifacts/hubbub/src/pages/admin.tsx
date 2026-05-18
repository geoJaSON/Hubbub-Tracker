import { useState } from "react";
import {
  useListUsers,
  useUpdateUser,
  getListUsersQueryKey,
} from "@workspace/api-client-react";
import type { UserAdminUpdate, UserAdminUpdateRole } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Layout } from "../components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Shield, User, DollarSign, UserPlus, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type UserRow = {
  id: number;
  clerkId: string;
  displayName: string;
  email?: string | null;
  role: string;
  active: boolean;
  hourlyRateCents?: number | null;
};

export default function AdminPage() {
  const { data: users = [], isLoading } = useListUsers();
  const updateUser = useUpdateUser();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [editingRate, setEditingRate] = useState<Record<string, string>>({});

  const patch = async (userId: string, data: UserAdminUpdate) => {
    try {
      await updateUser.mutateAsync({ userId, data });
      qc.invalidateQueries({ queryKey: getListUsersQueryKey() });
    } catch {
      toast({ title: "Failed to update user", variant: "destructive" });
    }
  };

  const handleSaveRate = async (userId: string) => {
    const rateStr = editingRate[userId] ?? "";
    const hourlyRateCents = rateStr ? Math.round(parseFloat(rateStr) * 100) : null;
    await patch(userId, { hourlyRateCents });
    setEditingRate((prev) => {
      const next = { ...prev };
      delete next[userId];
      return next;
    });
  };

  const signUpUrl = `${window.location.origin}/sign-up`;

  return (
    <Layout title="ADMIN // USERS">
      <div className="max-w-4xl space-y-4">
        {/* Onboarding guidance */}
        <div className="border border-border bg-card/50 p-4 flex items-start gap-3">
          <UserPlus className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <div className="flex-1 space-y-1">
            <div className="text-xs font-mono text-primary tracking-widest">// ONBOARDING NEW USERS</div>
            <p className="text-xs font-mono text-muted-foreground">
              New team members sign up at{" "}
              <a
                href={signUpUrl}
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:underline inline-flex items-center gap-1"
              >
                {signUpUrl}
                <ExternalLink className="h-2.5 w-2.5" />
              </a>
              {" "}— their account is automatically provisioned on first login. Manage their role,
              hourly rate, and active status below after they sign in.
            </p>
          </div>
        </div>

        {/* Header */}
        <div className="text-xs text-muted-foreground font-mono">
          {(users as UserRow[]).length} user(s) in system
        </div>

        {/* User list */}
        {isLoading ? (
          <div className="text-muted-foreground font-mono text-sm animate-pulse">LOADING...</div>
        ) : (
          <div className="border border-border bg-card divide-y divide-border">
            {(users as UserRow[]).map((u) => {
              const isEditingRate = u.clerkId in editingRate;
              const displayRate =
                u.hourlyRateCents != null
                  ? `$${(u.hourlyRateCents / 100).toFixed(2)}/hr`
                  : "—";

              return (
                <div key={u.id} className="flex items-center gap-3 px-4 py-3 flex-wrap">
                  <User
                    className={cn(
                      "h-4 w-4 shrink-0",
                      u.active ? "text-primary" : "text-muted-foreground",
                    )}
                  />

                  {/* Identity */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm text-foreground">{u.displayName}</span>
                      {u.role === "admin" && <Shield className="h-3 w-3 text-accent" />}
                    </div>
                    <p className="text-xs text-muted-foreground font-mono truncate">{u.email}</p>
                  </div>

                  {/* Hourly rate — click to edit inline */}
                  <div className="flex items-center gap-1 shrink-0">
                    <DollarSign className="h-3 w-3 text-muted-foreground" />
                    {isEditingRate ? (
                      <Input
                        value={editingRate[u.clerkId] ?? ""}
                        onChange={(e) =>
                          setEditingRate((p) => ({ ...p, [u.clerkId]: e.target.value }))
                        }
                        onBlur={() => void handleSaveRate(u.clerkId)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void handleSaveRate(u.clerkId);
                          if (e.key === "Escape")
                            setEditingRate((p) => {
                              const n = { ...p };
                              delete n[u.clerkId];
                              return n;
                            });
                        }}
                        className="bg-background border-border font-mono text-xs h-6 w-20 px-1 rounded-none"
                        type="number"
                        min="0"
                        step="0.01"
                        autoFocus
                      />
                    ) : (
                      <button
                        className="text-xs font-mono text-muted-foreground hover:text-primary transition-colors min-w-[56px] text-left"
                        onClick={() =>
                          setEditingRate((p) => ({
                            ...p,
                            [u.clerkId]:
                              u.hourlyRateCents != null
                                ? (u.hourlyRateCents / 100).toFixed(2)
                                : "",
                          }))
                        }
                        title="Click to edit hourly rate"
                      >
                        {displayRate}
                      </button>
                    )}
                  </div>

                  {/* Role toggle */}
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "font-mono text-xs border h-7 px-2 shrink-0",
                      u.role === "admin"
                        ? "border-accent/50 text-accent hover:bg-accent/10"
                        : "border-border text-muted-foreground hover:text-foreground",
                    )}
                    onClick={() =>
                      void patch(u.clerkId, {
                        role: (u.role === "admin" ? "member" : "admin") as UserAdminUpdateRole,
                      })
                    }
                  >
                    {u.role.toUpperCase()}
                  </Button>

                  {/* Active toggle */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-xs font-mono text-muted-foreground">
                      {u.active ? "ACTIVE" : "INACTIVE"}
                    </span>
                    <Switch
                      checked={u.active}
                      onCheckedChange={(checked) => void patch(u.clerkId, { active: checked })}
                      className="data-[state=checked]:bg-primary"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
