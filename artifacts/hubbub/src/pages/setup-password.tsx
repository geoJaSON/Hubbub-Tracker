import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth, type AuthUser } from "@/lib/auth-context";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function SetupPasswordPage() {
  const { signIn } = useAuth();
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [setupToken, setSetupToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${basePath}/api/auth/setup-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, setupToken }),
      });
      const data = await res.json() as { token?: string; user?: AuthUser; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Setup failed");
        return;
      }
      signIn(data.token!, data.user!);
      navigate("/dashboard");
    } catch {
      setError("Network error — is the server running?");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <div className="w-full max-w-[440px] border border-[#1a3320] bg-[#07100a] shadow-[0_0_20px_rgba(0,255,65,0.2)] p-8">
        <div className="mb-6">
          <h1 className="text-[#00ff41] font-['VT323'] text-2xl tracking-widest">
            // INITIAL SETUP
          </h1>
          <p className="text-[#1a8a2e] text-sm mt-1 font-mono">
            Set your password for a migrated account
          </p>
          <p className="text-[#1a3320] text-xs mt-2 font-mono">
            The setup token is the value of SESSION_SECRET in your .env file
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[#33ff55] text-xs font-mono tracking-wider mb-1">
              EMAIL
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full bg-[#0d1f0f] border border-[#1a3320] text-[#33ff55] font-mono text-sm px-3 py-2 focus:outline-none focus:border-[#00ff41] transition-colors"
            />
          </div>
          <div>
            <label className="block text-[#33ff55] text-xs font-mono tracking-wider mb-1">
              NEW PASSWORD
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              className="w-full bg-[#0d1f0f] border border-[#1a3320] text-[#33ff55] font-mono text-sm px-3 py-2 focus:outline-none focus:border-[#00ff41] transition-colors"
            />
          </div>
          <div>
            <label className="block text-[#33ff55] text-xs font-mono tracking-wider mb-1">
              SETUP TOKEN
            </label>
            <input
              type="password"
              value={setupToken}
              onChange={(e) => setSetupToken(e.target.value)}
              required
              placeholder="SESSION_SECRET from .env"
              className="w-full bg-[#0d1f0f] border border-[#1a3320] text-[#33ff55] font-mono text-sm px-3 py-2 focus:outline-none focus:border-[#00ff41] transition-colors placeholder:text-[#1a3320]"
            />
          </div>

          {error && (
            <div className="border border-[#ff3333] bg-[#1a0a0a] text-[#ff3333] text-xs font-mono p-2">
              ERR: {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#00ff41] text-[#07100a] font-bold tracking-wider text-sm py-2 hover:bg-[#33ff55] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "SETTING UP..." : "SET PASSWORD →"}
          </button>
        </form>

        <div className="mt-4 border-t border-[#1a3320] pt-4">
          <p className="text-[#1a8a2e] text-xs font-mono text-center">
            Already have a password?{" "}
            <Link href={`${basePath}/sign-in`} className="text-[#00ff41] hover:text-[#33ff55] transition-colors">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
