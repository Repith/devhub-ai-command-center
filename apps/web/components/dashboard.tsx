"use client";

import { AgentWorkspace } from "./agent-workspace";
import type { AuthenticatedUser } from "@devhub/contracts";

interface DashboardProps {
  accessToken: string;
  user: AuthenticatedUser;
  onLogout(): Promise<void>;
}

const plannedSections = ["Knowledge", "Runs", "Evaluations"];

export function Dashboard({
  accessToken,
  user,
  onLogout
}: DashboardProps): React.JSX.Element {
  return (
    <div className="dashboard-shell">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <aside className="sidebar">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            D
          </span>
          <span>DevHub</span>
        </div>
        <nav aria-label="Primary navigation">
          <a className="nav-item active" href="#agents" aria-current="page">
            <span aria-hidden="true">01</span>
            Agents
          </a>
          {plannedSections.map((section, index) => (
            <span className="nav-item planned" key={section}>
              <span aria-hidden="true">0{index + 2}</span>
              {section}
              <small>Planned</small>
            </span>
          ))}
        </nav>
        <div className="sidebar-foot">
          <p>{user.tenantName}</p>
          <span>{user.role.toLowerCase()}</span>
        </div>
      </aside>

      <main className="dashboard-main" id="main-content">
        <header className="topbar">
          <div>
            <p className="section-kicker">Workspace</p>
            <strong>{user.tenantName}</strong>
          </div>
          <div className="account-menu">
            <span className="avatar" aria-hidden="true">
              {(user.displayName ?? user.email).charAt(0).toUpperCase()}
            </span>
            <div>
              <strong>{user.displayName ?? user.email}</strong>
              <span>{user.email}</span>
            </div>
            <button className="text-button" type="button" onClick={onLogout}>
              Sign out
            </button>
          </div>
        </header>

        <AgentWorkspace
          accessToken={accessToken}
          canManage={user.role !== "MEMBER"}
        />
      </main>
    </div>
  );
}
