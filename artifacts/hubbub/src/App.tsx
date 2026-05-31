import { useEffect, useRef } from "react";
import { Switch, Route, useLocation, Router as WouterRouter, Redirect } from "wouter";
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { initApiClient } from "./lib/api";
import { AuthProvider, useAuth } from "./lib/auth-context";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Dashboard from "./pages/dashboard";
import ProjectsPage from "./pages/projects";
import ProjectPage from "./pages/project";
import ItemPage from "./pages/item";
import SearchPage from "./pages/search";
import AdminPage from "./pages/admin";
import StandupPage from "./pages/standup";
import LandingPage from "./pages/landing";
import ReportPage from "./pages/report";
import SignInPage from "./pages/sign-in";
import SignUpPage from "./pages/sign-up";
import SetupPasswordPage from "./pages/setup-password";
import { UserSync } from "./components/user-sync";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function ApiClientInit() {
  const { getToken } = useAuth();
  useEffect(() => {
    initApiClient(getToken);
  }, [getToken]);
  return null;
}

function AuthQueryClientCacheInvalidator() {
  const { userId } = useAuth();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) {
      qc.clear();
    }
    prevUserIdRef.current = userId;
  }, [userId, qc]);

  return null;
}

function HomeRedirect() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return null;
  if (isSignedIn) return <Redirect to="/dashboard" />;
  return <LandingPage />;
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return null;
  if (!isSignedIn) return <Redirect to="/" />;
  return (
    <UserSync>
      <Component />
    </UserSync>
  );
}

function AppRoutes() {
  return (
    <QueryClientProvider client={queryClient}>
      <ApiClientInit />
      <AuthQueryClientCacheInvalidator />
      <TooltipProvider>
        <Switch>
          <Route path="/" component={HomeRedirect} />
          <Route path="/sign-in/*?" component={SignInPage} />
          <Route path="/sign-up/*?" component={SignUpPage} />
          <Route path="/setup-password" component={SetupPasswordPage} />
          <Route path="/dashboard">
            {() => <ProtectedRoute component={Dashboard} />}
          </Route>
          <Route path="/projects">
            {() => <ProtectedRoute component={ProjectsPage} />}
          </Route>
          <Route path="/projects/:slug/report">
            {() => <ProtectedRoute component={ReportPage} />}
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
          <Route path="/standup">
            {() => <ProtectedRoute component={StandupPage} />}
          </Route>
          <Route path="/admin/users">
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
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </WouterRouter>
  );
}

export default App;
