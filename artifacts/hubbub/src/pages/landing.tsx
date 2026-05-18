import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Terminal, Zap, MessageSquare, BarChart3, Shield } from "lucide-react";

const BOOT_LINES = [
  "HUBBUB COMMAND CENTER v1.0",
  "─────────────────────────────────────",
  "INITIALIZING CORE MODULES...",
  "  [  OK  ] database.postgresql",
  "  [  OK  ] auth.clerk",
  "  [  OK  ] api.express",
  "  [  OK  ] realtime.sse",
  "MOUNTING USER INTERFACE...",
  "  [  OK  ] components.react",
  "  [  OK  ] routes.wouter",
  "  [  OK  ] queries.tanstack",
  "RUNNING DIAGNOSTICS...",
  "  [  OK  ] schema.integrity",
  "  [  OK  ] permissions.rbac",
  "─────────────────────────────────────",
  "ALL SYSTEMS NOMINAL.",
  "STATUS: READY",
];

const features = [
  { icon: Terminal, text: "PROJECT TRACKING // Items, bugs, decisions" },
  { icon: Zap, text: "KANBAN BOARDS // Visual workflow management" },
  { icon: MessageSquare, text: "TEAM CHAT // Real-time with slash commands" },
  { icon: BarChart3, text: "BURN-DOWN // Cost & time analytics" },
  { icon: Shield, text: "STANDUP GEN // Automatic daily summaries" },
];

export default function LandingPage() {
  const alreadyBooted =
    typeof sessionStorage !== "undefined"
      ? sessionStorage.getItem("hubbub_booted") === "1"
      : true;

  const [bootDone, setBootDone] = useState(alreadyBooted);
  const [visibleLines, setVisibleLines] = useState(alreadyBooted ? BOOT_LINES.length : 0);

  useEffect(() => {
    if (alreadyBooted) return;

    let idx = 0;
    const iv = setInterval(() => {
      idx += 1;
      setVisibleLines(idx);
      if (idx >= BOOT_LINES.length) {
        clearInterval(iv);
        setTimeout(() => {
          try {
            sessionStorage.setItem("hubbub_booted", "1");
          } catch {
            // storage may be unavailable
          }
          setBootDone(true);
        }, 700);
      }
    }, 110);

    return () => clearInterval(iv);
  }, [alreadyBooted]);

  if (!bootDone) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-8 font-mono">
        <div className="w-full max-w-lg space-y-0.5 text-sm">
          {BOOT_LINES.slice(0, visibleLines).map((line, i) => (
            <div
              key={i}
              className={
                line.startsWith("STATUS:")
                  ? "text-primary font-bold tracking-widest mt-2"
                  : line.startsWith("  [  OK  ]")
                  ? "text-muted-foreground"
                  : line.startsWith("─")
                  ? "text-border"
                  : "text-foreground tracking-wide"
              }
            >
              {line}
            </div>
          ))}
          {visibleLines < BOOT_LINES.length && (
            <span className="text-primary animate-pulse">█</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 py-16">
      <div className="w-full max-w-2xl space-y-12 text-center">
        {/* Logo */}
        <div className="space-y-2">
          <div className="inline-block border border-primary/40 px-6 py-4 shadow-[0_0_30px_rgba(0,255,65,0.2)]">
            <h1
              className="text-6xl tracking-[0.3em] text-primary terminal-glow cursor-blink"
              style={{ fontFamily: "'VT323', monospace" }}
            >
              HUBBUB
            </h1>
          </div>
          <p className="text-muted-foreground font-mono text-sm tracking-widest">
            // TEAM COMMAND CENTER v1.0
          </p>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="flex-1 border-t border-border" />
          <span className="text-primary font-mono text-xs">STATUS: READY</span>
          <div className="flex-1 border-t border-border" />
        </div>

        {/* Features */}
        <div className="grid grid-cols-1 gap-2 text-left">
          {features.map((f, i) => (
            <div
              key={i}
              className="flex items-center gap-3 border border-border px-4 py-3 bg-card/50 hover:border-primary/50 hover:bg-muted/30 transition-colors"
            >
              <span className="text-primary font-mono text-xs shrink-0">
                [{String(i + 1).padStart(2, "0")}]
              </span>
              <f.icon className="h-4 w-4 text-primary shrink-0" />
              <span className="text-foreground font-mono text-sm">{f.text}</span>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/sign-in"
            className="border border-primary bg-primary/10 px-8 py-3 text-primary font-mono text-sm tracking-widest hover:bg-primary/20 transition-colors shadow-[0_0_12px_rgba(0,255,65,0.3)] hover:shadow-[0_0_20px_rgba(0,255,65,0.5)]"
          >
            &gt; SIGN IN
          </Link>
          <Link
            href="/sign-up"
            className="border border-border px-8 py-3 text-foreground font-mono text-sm tracking-widest hover:border-primary/50 hover:text-primary transition-colors"
          >
            &gt; REGISTER
          </Link>
        </div>

        <p className="text-muted-foreground font-mono text-xs">
          SELF-HOSTED TEAM INTELLIGENCE PLATFORM
        </p>
      </div>
    </div>
  );
}
