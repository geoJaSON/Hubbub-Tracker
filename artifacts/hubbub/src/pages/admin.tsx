import { useState } from "react";
import {
  useListUsers,
  useUpdateUser,
  useCreateUser,
  getListUsersQueryKey,
} from "@workspace/api-client-react";
import type {
  UserAdminUpdate,
  UserAdminUpdateRole,
  UserInput,
  UserInputRole,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Layout } from "../components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Shield, User, Plus, DollarSign } from "lucide-react";
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
  const createUser = useCreateUser();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [showCreate, setShowCreate] = useState(false);
  const [newUser, setNewUser] = useState({
    email: "",
    displayName: "",
    username: "",
    role: "member" as UserInputRole,
    hourlyRate: "",
  });
  const [editingRate, setEditingRate] = useState<Record<string, string>>({});

  const patch = async (userId: string, data: UserAdminUpdate) => {
    try {
      await updateUser.mutateAsync({ userId, data });
      qc.invalidateQueries({ queryKey: getListUsersQueryKey() });
    } catch {
      toast({ title: "Failed to update user", variant: "destructive" });
    }
  };

  const handleCreate = async () => {
    if (!newUser.email.trim() || !newUser.displayName.trim()) {
      toast({ title: "Email and display name are required", variant: "destructive" });
      return;
    }
    try {
      const hourlyRateCents = newUser.hourlyRate
        ? Math.round(parseFloat(newUser.hourlyRate) * 100)
        : null;
      const input: UserInput = {
        email: newUser.email,
        displayName: newUser.displayName,
        username: newUser.username || null,
        role: newUser.role,
        hourlyRateCents,
      };
      await createUser.mutateAsync({ data: input });
      qc.invalidateQueries({ queryKey: getListUsersQueryKey() });
      setShowCreate(false);
      setNewUser({ email: "", displayName: "", username: "", role: "member", hourlyRate: "" });
      toast({ title: "User created" });
    } catch {
      toast({ title: "Failed to create user", variant: "destructive" });
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

  return (
    <Layout title="ADMIN // USERS">
      <div className="max-w-4xl space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="text-xs text-muted-foreground font-mono">
            {(users as UserRow[]).length} user(s) in system
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto font-mono text-xs border border-primary/50 text-primary hover:bg-primary/10 gap-1"
            onClick={() => setShowCreate((v) => !v)}
          >
            <Plus className="h-3 w-3" />
            {showCreate ? "CANCEL" : "NEW USER"}
          </Button>
        </div>

        {/* Create user form */}
        {showCreate && (
          <div className="border border-primary/30 bg-card p-4 space-y-3">
            <div className="text-xs font-mono text-primary tracking-widest">// CREATE USER</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="font-mono text-xs text-muted-foreground">EMAIL *</Label>
                <Input
                  value={newUser.email}
                  onChange={(e) => setNewUser((p) => ({ ...p, email: e.target.value }))}
                  className="bg-background border-border font-mono text-sm h-8 rounded-none"
                  placeholder="user@example.com"
                />
              </div>
              <div className="space-y-1">
                <Label className="font-mono text-xs text-muted-foreground">DISPLAY NAME *</Label>
                <Input
                  value={newUser.displayName}
                  onChange={(e) => setNewUser((p) => ({ ...p, displayName: e.target.value }))}
                  className="bg-background border-border font-mono text-sm h-8 rounded-none"
                  placeholder="Jane Doe"
                />
              </div>
              <div className="space-y-1">
                <Label className="font-mono text-xs text-muted-foreground">USERNAME</Label>
                <Input
                  value={newUser.username}
                  onChange={(e) => setNewUser((p) => ({ ...p, username: e.target.value }))}
                  className="bg-background border-border font-mono text-sm h-8 rounded-none"
                  placeholder="janedoe"
                />
              </div>
              <div className="space-y-1">
                <Label className="font-mono text-xs text-muted-foreground">ROLE</Label>
                <Select
                  value={newUser.role}
                  onValueChange={(v) => setNewUser((p) => ({ ...p, role: v as UserInputRole }))}
                >
                  <SelectTrigger className="h-8 border-border font-mono text-xs rounded-none">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border font-mono text-xs rounded-none">
                    <SelectItem value="member">MEMBER</SelectItem>
                    <SelectItem value="admin">ADMIN</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="font-mono text-xs text-muted-foreground">
                  HOURLY RATE ($/hr)
                </Label>
                <Input
                  value={newUser.hourlyRate}
                  onChange={(e) => setNewUser((p) => ({ ...p, hourlyRate: e.target.value }))}
                  className="bg-background border-border font-mono text-sm h-8 rounded-none"
                  placeholder="0.00"
                  type="number"
                  min="0"
                  step="0.01"
                />
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => void handleCreate()}
              disabled={createUser.isPending}
              className="bg-primary text-primary-foreground font-mono text-xs hover:bg-primary/90"
            >
              {createUser.isPending ? "CREATING..." : "CREATE USER"}
            </Button>
          </div>
        )}

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
