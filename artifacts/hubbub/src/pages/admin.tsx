import { useState } from "react";
import {
  useListUsers,
  useUpdateUser,
  useCreateUser,
  getListUsersQueryKey,
} from "@workspace/api-client-react";
import type { UserAdminUpdate, UserAdminUpdateRole, UserInput } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Layout } from "../components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Shield, User, DollarSign, UserPlus, Plus } from "lucide-react";
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

const EMPTY_FORM = { displayName: "", email: "", role: "member" as "member" | "admin" };

export default function AdminPage() {
  const { data: users = [], isLoading } = useListUsers();
  const updateUser = useUpdateUser();
  const createUser = useCreateUser();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [editingRate, setEditingRate] = useState<Record<string, string>>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [newUser, setNewUser] = useState(EMPTY_FORM);

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

  const handleCreateUser = async () => {
    if (!newUser.email.trim() || !newUser.displayName.trim()) return;
    try {
      const input: UserInput = {
        email: newUser.email.trim(),
        displayName: newUser.displayName.trim(),
        role: newUser.role,
      };
      await createUser.mutateAsync({ data: input });
      qc.invalidateQueries({ queryKey: getListUsersQueryKey() });
      setCreateOpen(false);
      setNewUser(EMPTY_FORM);
      toast({
        title: "User created",
        description: `${input.displayName} (${input.email}) will be linked when they sign in with this email.`,
      });
    } catch {
      toast({ title: "Failed to create user", variant: "destructive" });
    }
  };

  return (
    <Layout title="ADMIN // USERS">
      <div className="max-w-4xl space-y-4">
        {/* Header row */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground font-mono">
            {(users as UserRow[]).length} user(s) in system
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="font-mono text-xs border border-primary/50 text-primary hover:bg-primary/10 gap-1"
            onClick={() => { setNewUser(EMPTY_FORM); setCreateOpen(true); }}
          >
            <Plus className="h-3 w-3" /> ADD USER
          </Button>
        </div>

        {/* Onboarding note */}
        <div className="border border-border bg-card/50 p-3 flex items-start gap-3">
          <UserPlus className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <p className="text-xs font-mono text-muted-foreground">
            Use <span className="text-primary">ADD USER</span> to pre-provision accounts. The record will be
            automatically claimed when the user signs in with the same email address.
          </p>
        </div>

        {/* User list */}
        {isLoading ? (
          <div className="text-muted-foreground font-mono text-sm animate-pulse">LOADING...</div>
        ) : (
          <div className="border border-border bg-card divide-y divide-border">
            {(users as UserRow[]).length === 0 && (
              <div className="p-6 text-center text-muted-foreground font-mono text-sm">no users yet</div>
            )}
            {(users as UserRow[]).map((u) => {
              const isEditingRate = u.clerkId in editingRate;
              const displayRate =
                u.hourlyRateCents != null
                  ? `$${(u.hourlyRateCents / 100).toFixed(2)}/hr`
                  : "—";
              const isPending = u.clerkId.startsWith("manual_");

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
                      {isPending && (
                        <span className="text-[10px] font-mono text-muted-foreground border border-border px-1">
                          PENDING SIGN-IN
                        </span>
                      )}
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

      {/* Create User Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-['VT323'] tracking-widest text-xl text-primary">
              // ADD USER
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="font-mono text-xs tracking-widest text-muted-foreground">DISPLAY NAME</Label>
              <Input
                value={newUser.displayName}
                onChange={(e) => setNewUser((p) => ({ ...p, displayName: e.target.value }))}
                className="bg-background border-border font-mono text-sm rounded-none focus-visible:ring-primary"
                placeholder="Jane Doe"
              />
            </div>
            <div className="space-y-1">
              <Label className="font-mono text-xs tracking-widest text-muted-foreground">EMAIL</Label>
              <Input
                value={newUser.email}
                onChange={(e) => setNewUser((p) => ({ ...p, email: e.target.value }))}
                className="bg-background border-border font-mono text-sm rounded-none focus-visible:ring-primary"
                placeholder="jane@example.com"
                type="email"
              />
            </div>
            <div className="space-y-1">
              <Label className="font-mono text-xs tracking-widest text-muted-foreground">ROLE</Label>
              <Select
                value={newUser.role}
                onValueChange={(v) => setNewUser((p) => ({ ...p, role: v as "member" | "admin" }))}
              >
                <SelectTrigger className="bg-background border-border font-mono text-xs h-8 rounded-none">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="member" className="font-mono text-xs">MEMBER</SelectItem>
                  <SelectItem value="admin" className="font-mono text-xs">ADMIN</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-[10px] font-mono text-muted-foreground">
              A pending record is created and claimed automatically when the user signs in with this email.
            </p>
            <div className="flex gap-2 justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCreateOpen(false)}
                className="font-mono text-xs text-muted-foreground"
              >
                CANCEL
              </Button>
              <Button
                size="sm"
                onClick={() => void handleCreateUser()}
                disabled={!newUser.email.trim() || !newUser.displayName.trim() || createUser.isPending}
                className="font-mono text-xs bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {createUser.isPending ? "CREATING..." : "CREATE"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
