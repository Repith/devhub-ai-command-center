"use client";

import { AuthPanel } from "./auth-panel";
import { Dashboard } from "./dashboard";
import { useAuth } from "@/lib/auth";

export function CommandCenter(): React.JSX.Element {
  const auth = useAuth();

  if (auth.status === "loading") {
    return (
      <main className="session-loading" aria-busy="true">
        <div className="brand-mark" aria-hidden="true">
          D
        </div>
        <p>Restoring your command center…</p>
      </main>
    );
  }

  if (auth.status === "anonymous" || !auth.user || !auth.accessToken) {
    return <AuthPanel onLogin={auth.login} onRegister={auth.register} />;
  }

  return (
    <Dashboard
      accessToken={auth.accessToken}
      user={auth.user}
      onLogout={auth.logout}
    />
  );
}
