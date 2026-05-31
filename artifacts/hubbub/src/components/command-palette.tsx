import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Command, CommandInput, CommandList, CommandItem, CommandGroup, CommandEmpty } from "cmdk";
import { LayoutDashboard, FolderKanban, Search, Settings, LogOut, CalendarDays } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const commands = [
  { id: "dashboard", label: "Go to Dashboard", icon: LayoutDashboard, href: "/dashboard" },
  { id: "projects", label: "Go to Projects", icon: FolderKanban, href: "/projects" },
  { id: "search", label: "Search", icon: Search, href: "/search" },
  { id: "standup", label: "Daily Standup", icon: CalendarDays, href: "/standup" },
  { id: "admin", label: "Admin Users", icon: Settings, href: "/admin/users" },
];

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const [, setLocation] = useLocation();
  const { signOut } = useAuth();
  const [query, setQuery] = useState("");

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onOpenChange]);

  function run(href?: string) {
    onOpenChange(false);
    setQuery("");
    if (href) setLocation(href);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 gap-0 bg-card border-border max-w-lg overflow-hidden">
        <Command className="bg-transparent" shouldFilter>
          <div className="flex items-center border-b border-border px-3 py-2 gap-2">
            <span className="text-primary font-mono text-sm">$</span>
            <CommandInput
              placeholder="type a command..."
              value={query}
              onValueChange={setQuery}
              className="flex-1 bg-transparent text-foreground font-mono text-sm outline-none placeholder:text-muted-foreground"
            />
            <kbd className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5">ESC</kbd>
          </div>
          <CommandList className="max-h-64 overflow-auto p-1">
            <CommandEmpty className="py-4 text-center text-sm text-muted-foreground font-mono">
              no commands found
            </CommandEmpty>
            <CommandGroup heading={<span className="text-muted-foreground text-xs tracking-widest">NAVIGATE</span>}>
              {commands.map((cmd) => (
                <CommandItem
                  key={cmd.id}
                  value={cmd.label}
                  onSelect={() => run(cmd.href)}
                  className="flex items-center gap-2 px-2 py-1.5 text-sm cursor-pointer text-foreground hover:bg-muted data-[selected=true]:bg-muted font-mono"
                >
                  <cmd.icon className="h-3.5 w-3.5 text-primary shrink-0" />
                  {cmd.label}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandGroup heading={<span className="text-muted-foreground text-xs tracking-widest">SESSION</span>}>
              <CommandItem
                value="sign out logout"
                onSelect={() => { onOpenChange(false); signOut(); setLocation(basePath || "/"); }}
                className="flex items-center gap-2 px-2 py-1.5 text-sm cursor-pointer text-destructive hover:bg-muted data-[selected=true]:bg-muted font-mono"
              >
                <LogOut className="h-3.5 w-3.5 shrink-0" />
                Sign Out
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
