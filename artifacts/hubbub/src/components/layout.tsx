import { ReactNode, useState, useCallback, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useClerk, useUser } from "@clerk/react";
import {
  LayoutDashboard,
  FolderKanban,
  Search,
  Settings,
  LogOut,
  Menu,
  X,
  Terminal,
  ChevronRight,
  Sun,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CommandPalette } from "./command-palette";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── Theme ─────────────────────────────────────────────────────────────────────
type Theme = "green" | "amber";

function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    return (localStorage.getItem("hubbub-theme") as Theme) ?? "green";
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "amber") {
      root.style.setProperty("--primary", "43 96% 58%");     // amber
      root.style.setProperty("--primary-foreground", "0 0% 5%");
      root.style.setProperty("--accent", "38 92% 70%");
    } else {
      root.style.setProperty("--primary", "124 100% 50%");   // phosphor green
      root.style.setProperty("--primary-foreground", "124 100% 5%");
      root.style.setProperty("--accent", "124 80% 65%");
    }
    localStorage.setItem("hubbub-theme", theme);
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((t) => (t === "green" ? "amber" : "green"));
  }, []);

  return { theme, toggle };
}

// ── Keyboard chords ───────────────────────────────────────────────────────────
// g d → /dashboard   g p → /projects   g s → /search
// : → command palette (same as ⌘K)
function useKeyboardChords(
  navigate: (to: string) => void,
  openPalette: () => void,
) {
  const pending = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Skip if focus is inside an input/textarea/contenteditable
      const tag = (e.target as HTMLElement).tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        (e.target as HTMLElement).isContentEditable
      )
        return;

      // `:` → command palette
      if (e.key === ":" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        openPalette();
        return;
      }

      // g-chord navigation
      if (pending.current === "g") {
        if (timer.current) clearTimeout(timer.current);
        pending.current = null;
        const map: Record<string, string> = {
          d: "/dashboard",
          p: "/projects",
          s: "/search",
          a: "/admin",
        };
        if (map[e.key]) {
          e.preventDefault();
          navigate(map[e.key]);
        }
        return;
      }

      if (e.key === "g" && !e.metaKey && !e.ctrlKey) {
        pending.current = "g";
        timer.current = setTimeout(() => { pending.current = null; }, 1000);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [navigate, openPalette]);
}

interface NavItem {
  label: string;
  icon: typeof LayoutDashboard;
  href: string;
}

const nav: NavItem[] = [
  { label: "DASHBOARD", icon: LayoutDashboard, href: "/dashboard" },
  { label: "PROJECTS", icon: FolderKanban, href: "/projects" },
  { label: "SEARCH", icon: Search, href: "/search" },
  { label: "ADMIN", icon: Settings, href: "/admin" },
];

interface LayoutProps {
  children: ReactNode;
  title?: string;
}

export function Layout({ children, title }: LayoutProps) {
  const [location, navigate] = useLocation();
  const { signOut } = useClerk();
  const { user } = useUser();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { theme, toggle: toggleTheme } = useTheme();

  const handleSignOut = useCallback(() => {
    signOut({ redirectUrl: basePath || "/" });
  }, [signOut]);

  const openPalette = useCallback(() => setPaletteOpen(true), []);
  useKeyboardChords(navigate, openPalette);

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      {/* Command Palette */}
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/70 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 flex w-56 flex-col border-r border-border bg-sidebar transition-transform lg:relative lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {/* Logo */}
        <div className="flex h-14 items-center gap-2 border-b border-border px-4">
          <Terminal className="h-5 w-5 text-primary" />
          <span
            className="text-xl tracking-[0.15em] text-primary terminal-glow"
            style={{ fontFamily: "'VT323', monospace" }}
          >
            HUBBUB
          </span>
          <button
            className="ml-auto text-muted-foreground hover:text-foreground lg:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-0.5 p-2 overflow-y-auto">
          {nav.map((item) => {
            const active = location.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 text-sm transition-colors",
                  "border border-transparent hover:border-primary/30 hover:bg-muted",
                  active
                    ? "border-primary/50 bg-muted text-primary terminal-glow"
                    : "text-sidebar-foreground",
                )}
              >
                {active ? (
                  <ChevronRight className="h-3 w-3 text-primary shrink-0" />
                ) : (
                  <span className="w-3 shrink-0" />
                )}
                <item.icon className="h-3.5 w-3.5 shrink-0" />
                <span className="font-mono text-xs tracking-widest">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="border-t border-border p-3 space-y-2">
          {/* Command palette trigger */}
          <button
            onClick={() => setPaletteOpen(true)}
            className="w-full text-left text-xs text-muted-foreground hover:text-foreground border border-border px-2 py-1.5 font-mono flex items-center gap-2"
          >
            <span className="text-primary">$</span>
            <span>CMD PALETTE</span>
            <kbd className="ml-auto text-[10px] bg-muted px-1 rounded-sm">⌘K / :</kbd>
          </button>

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            title={`Switch to ${theme === "green" ? "amber" : "green"} theme`}
            className="w-full text-left text-xs text-muted-foreground hover:text-foreground border border-border px-2 py-1.5 font-mono flex items-center gap-2"
          >
            <Sun className="h-3 w-3 text-primary shrink-0" />
            <span>THEME: {theme.toUpperCase()}</span>
          </button>

          {/* User + sign out */}
          <div className="flex items-center gap-2 px-1">
            <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
            <span className="text-xs text-muted-foreground truncate flex-1">
              {user?.username ?? user?.firstName ?? "USER"}
            </span>
            <button
              onClick={handleSignOut}
              className="text-muted-foreground hover:text-destructive transition-colors"
              title="Sign out"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Chord hint */}
          <p className="text-[10px] font-mono text-muted-foreground/60 px-1">
            g+d dashboard · g+p projects · g+s search
          </p>
        </div>
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-14 items-center gap-3 border-b border-border px-4">
          <button
            className="text-muted-foreground hover:text-foreground lg:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>
          {title && (
            <h1
              className="text-lg tracking-widest text-foreground"
              style={{ fontFamily: "'VT323', monospace" }}
            >
              // {title}
            </h1>
          )}
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-xs text-muted-foreground sm:block font-mono">
              {new Date().toISOString().split("T")[0]}
            </span>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto p-4">{children}</main>
      </div>
    </div>
  );
}
