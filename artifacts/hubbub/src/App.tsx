import { useEffect, useRef } from "react";
import { ClerkProvider, SignIn, SignUp, Show, useClerk, useAuth } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { Switch, Route, useLocation, Router as WouterRouter, Redirect } from "wouter";
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { initApiClient } from "./lib/api";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Dashboard from "./pages/dashboard";
import ProjectsPage from "./pages/projects";
import ProjectPage from "./pages/project";
import ItemPage from "./pages/item";
import SearchPage from "./pages/search";
import AdminPage from "./pages/admin";
import LandingPage from "./pages/landing";
import { UserSync } from "./components/user-sync";

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY");
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "#00ff41",
    colorForeground: "#33ff55",
    colorMutedForeground: "#1a8a2e",
    colorDanger: "#ff3333",
    colorBackground: "#07100a",
    colorInput: "#0d1f0f",
    colorInputForeground: "#33ff55",
    colorNeutral: "#1a3320",
    fontFamily: "'Share Tech Mono', monospace",
    borderRadius: "2px",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-[#07100a] border border-[#1a3320] rounded-sm w-[440px] max-w-full overflow-hidden shadow-[0_0_20px_rgba(0,255,65,0.2)]",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-[#00ff41] font-['VT323'] text-2xl tracking-widest",
    headerSubtitle: "text-[#1a8a2e]",
    socialButtonsBlockButtonText: "text-[#33ff55]",
    formFieldLabel: "text-[#33ff55]",
    footerActionLink: "text-[#00ff41] hover:text-[#33ff55]",
    footerActionText: "text-[#1a8a2e]",
    dividerText: "text-[#1a8a2e]",
    identityPreviewEditButton: "text-[#00ff41]",
    formFieldSuccessText: "text-[#00ff41]",
    alertText: "text-[#ff3333]",
    logoBox: "justify-center py-2",
    logoImage: "h-10",
    socialButtonsBlockButton: "border border-[#1a3320] bg-[#0d1f0f] hover:bg-[#122a15]",
    formButtonPrimary: "bg-[#00ff41] text-[#07100a] hover:bg-[#33ff55] font-bold tracking-wider",
    formFieldInput: "bg-[#0d1f0f] border-[#1a3320] text-[#33ff55] font-mono",
    footerAction: "border-t border-[#1a3320]",
    dividerLine: "border-[#1a3320]",
    alert: "border border-[#ff3333] bg-[#1a0a0a]",
    otpCodeFieldInput: "bg-[#0d1f0f] border-[#1a3320] text-[#00ff41]",
    formFieldRow: "gap-2",
    main: "gap-4",
  },
};

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </div>
  );
}

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in">
        <Redirect to="/dashboard" />
      </Show>
      <Show when="signed-out">
        <LandingPage />
      </Show>
    </>
  );
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  return (
    <>
      <Show when="signed-in">
        <UserSync>
          <Component />
        </UserSync>
      </Show>
      <Show when="signed-out">
        <Redirect to="/" />
      </Show>
    </>
  );
}

function ApiClientInit() {
  const { getToken } = useAuth();
  useEffect(() => {
    initApiClient(() => getToken());
  }, [getToken]);
  return null;
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) {
        qc.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);

  return null;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: {
          start: { title: "// AUTHENTICATE", subtitle: "Sign in to access your command center" },
        },
        signUp: {
          start: { title: "// REGISTER", subtitle: "Create your Hubbub account" },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ApiClientInit />
        <ClerkQueryClientCacheInvalidator />
        <TooltipProvider>
          <Switch>
            <Route path="/" component={HomeRedirect} />
            <Route path="/sign-in/*?" component={SignInPage} />
            <Route path="/sign-up/*?" component={SignUpPage} />
            <Route path="/dashboard">
              {() => <ProtectedRoute component={Dashboard} />}
            </Route>
            <Route path="/projects">
              {() => <ProtectedRoute component={ProjectsPage} />}
            </Route>
            <Route path="/projects/:slug/:tab?">
              {() => <ProtectedRoute component={ProjectPage} />}
            </Route>
            <Route path="/projects/:slug/items/:number">
              {() => <ProtectedRoute component={ItemPage} />}
            </Route>
            <Route path="/search">
              {() => <ProtectedRoute component={SearchPage} />}
            </Route>
            <Route path="/admin">
              {() => <ProtectedRoute component={AdminPage} />}
            </Route>
            <Route>
              <div className="flex h-screen items-center justify-center">
                <p className="text-foreground font-mono">404 // PATH NOT FOUND</p>
              </div>
            </Route>
          </Switch>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
