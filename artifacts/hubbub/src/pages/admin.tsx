import { useState } from "react";
import { useListUsers, useUpdateUser, getListUsersQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Layout } from "../components/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Shield, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export default function AdminPage() {
  const { data: users = [], isLoading } = useListUsers();
  const updateUser = useUpdateUser();
  const qc = useQueryClient();
  const { toast } = useToast();

  const toggle = async (userId: string, field: string, value: unknown) => {
    try {
      await updateUser.mutateAsync({
        userId,
        data: { [field]: value } as any,
      });
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
            {users.map((u) => (
              <div key={u.id} className="flex items-center gap-4 px-4 py-3">
                <User className={cn("h-4 w-4 shrink-0", u.active ? "text-primary" : "text-muted-foreground")} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm text-foreground">{u.displayName}</span>
                    {u.role === "admin" && (
                      <Shield className="h-3 w-3 text-accent" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground font-mono">
                    {u.email ?? u.clerkId}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <span className={cn(
                    "text-xs font-mono tracking-widest border px-2 py-0.5",
                    u.role === "admin" ? "border-accent text-accent" : "border-border text-muted-foreground"
                  )}>
                    {u.role.toUpperCase()}
                  </span>
                  <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
                    <span>ACTIVE</span>
                    <Switch
                      checked={u.active}
                      onCheckedChange={(v) => toggle(u.clerkId, "active", v)}
                      className="scale-75"
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs font-mono border border-border hover:border-accent hover:text-accent h-7 px-2"
                    onClick={() => toggle(u.clerkId, "role", u.role === "admin" ? "member" : "admin")}
                  >
                    {u.role === "admin" ? "DEMOTE" : "PROMOTE"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
