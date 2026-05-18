import { useListUsers, useUpdateUser, getListUsersQueryKey } from "@workspace/api-client-react";
import type { UserAdminUpdate, UserAdminUpdateRole } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Layout } from "../components/layout";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Shield, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export default function AdminPage() {
  const { data: users = [], isLoading } = useListUsers();
  const updateUser = useUpdateUser();
  const qc = useQueryClient();
  const { toast } = useToast();

  const patch = async (userId: string, data: UserAdminUpdate) => {
    try {
      await updateUser.mutateAsync({ userId, data });
      qc.invalidateQueries({ queryKey: getListUsersQueryKey() });
    } catch {
      toast({ title: "Failed to update user", variant: "destructive" });
    }
  };

  return (
    <Layout title="ADMIN">
      <div className="max-w-4xl space-y-4">
        <div className="text-xs text-muted-foreground font-mono">
          {users.length} user(s) in system
        </div>

        {isLoading ? (
          <div className="text-muted-foreground font-mono text-sm animate-pulse">LOADING...</div>
        ) : (
          <div className="border border-border bg-card divide-y divide-border">
            {(users as Array<{
              id: number;
              clerkId: string;
              displayName: string;
              email?: string | null;
              role: string;
              active: boolean;
            }>).map((u) => (
              <div key={u.id} className="flex items-center gap-4 px-4 py-3">
                <User className={cn("h-4 w-4 shrink-0", u.active ? "text-primary" : "text-muted-foreground")} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm text-foreground">{u.displayName}</span>
                    {u.role === "admin" && <Shield className="h-3 w-3 text-accent" />}
                  </div>
                  <p className="text-xs text-muted-foreground font-mono truncate">{u.email}</p>
                </div>

                {/* Role toggle */}
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "font-mono text-xs border h-7 px-2",
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
                <div className="flex items-center gap-1.5">
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
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
