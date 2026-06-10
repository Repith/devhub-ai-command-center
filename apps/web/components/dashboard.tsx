"use client";

import { useState } from "react";

import { AgentWorkspace } from "./agent-workspace";
import { ChatWorkspace } from "./chat-workspace";
import { RunsWorkspace } from "./runs-workspace";
import type { AuthenticatedUser } from "@devhub/contracts";

interface DashboardProps {
  accessToken: string;
  user: AuthenticatedUser;
  onLogout(): Promise<void>;
}

const plannedSections = ["Knowledge", "Evaluations"];
type DashboardSection = "agents" | "chat" | "runs";

export function Dashboard({
  accessToken,
  user,
  onLogout
}: DashboardProps): React.JSX.Element {
  const [section, setSection] = useState<DashboardSection>("agents");

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
          <button
            className={`nav-item ${section === "agents" ? "active" : ""}`}
            type="button"
            aria-current={section === "agents" ? "page" : undefined}
            onClick={() => setSection("agents")}
          >
            <span aria-hidden="true">01</span>
            Agents
          </button>
          <button
            className={`nav-item ${section === "chat" ? "active" : ""}`}
            type="button"
            aria-current={section === "chat" ? "page" : undefined}
            onClick={() => setSection("chat")}
          >
            <span aria-hidden="true">02</span>
            Chat
          </button>
          <button
            className={`nav-item ${section === "runs" ? "active" : ""}`}
            type="button"
            aria-current={section === "runs" ? "page" : undefined}
            onClick={() => setSection("runs")}
          >
            <span aria-hidden="true">03</span>
            Runs
          </button>
          {plannedSections.map((section, index) => (
            <span className="nav-item planned" key={section}>
              <span aria-hidden="true">0{index + 4}</span>
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

        {section === "agents" ? (
          <AgentWorkspace
            accessToken={accessToken}
            canManage={user.role !== "MEMBER"}
          />
        ) : section === "chat" ? (
          <ChatWorkspace accessToken={accessToken} />
        ) : (
          <RunsWorkspace accessToken={accessToken} />
        )}
      </main>
    </div>
  );
}
