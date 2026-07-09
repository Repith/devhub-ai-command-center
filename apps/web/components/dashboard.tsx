"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { AgentWorkspace } from "./agent-workspace";
import { AnalyticsWorkspace } from "./analytics-workspace";
import { ChatWorkspace } from "./chat-workspace";
import { DashboardHome } from "./dashboard-home";
import { GmailWorkspace } from "./gmail-workspace";
import { KnowledgeWorkspace } from "./knowledge-workspace";
import { NewsWorkspace } from "./news-workspace";
import type { AuthenticatedUser } from "@devhub/contracts";

interface DashboardProps {
  accessToken: string;
  user: AuthenticatedUser;
  onLogout(): Promise<void>;
}

const plannedSections = ["Settings"];
type DashboardSection =
  | "home"
  | "agents"
  | "chat"
  | "analytics"
  | "knowledge"
  | "gmail"
  | "news";

export function Dashboard({
  accessToken,
  user,
  onLogout
}: DashboardProps): React.JSX.Element {
  const searchParams = useSearchParams();
  const requestedSection = searchParams.get("section");
  const [section, setSection] = useState<DashboardSection>(() =>
    isDashboardSection(requestedSection) ? requestedSection : "home"
  );

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
            className={`nav-item ${section === "home" ? "active" : ""}`}
            type="button"
            aria-current={section === "home" ? "page" : undefined}
            onClick={() => setSection("home")}
          >
            <span aria-hidden="true">01</span>
            Home
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
            className={`nav-item ${section === "agents" ? "active" : ""}`}
            type="button"
            aria-current={section === "agents" ? "page" : undefined}
            onClick={() => setSection("agents")}
          >
            <span aria-hidden="true">03</span>
            Agents
          </button>
          <button
            className={`nav-item ${section === "analytics" ? "active" : ""}`}
            type="button"
            aria-current={section === "analytics" ? "page" : undefined}
            onClick={() => setSection("analytics")}
          >
            <span aria-hidden="true">04</span>
            Analytics
          </button>
          <button
            className={`nav-item ${section === "gmail" ? "active" : ""}`}
            type="button"
            aria-current={section === "gmail" ? "page" : undefined}
            onClick={() => setSection("gmail")}
          >
            <span aria-hidden="true">05</span>
            Gmail
          </button>
          <button
            className={`nav-item ${section === "knowledge" ? "active" : ""}`}
            type="button"
            aria-current={section === "knowledge" ? "page" : undefined}
            onClick={() => setSection("knowledge")}
          >
            <span aria-hidden="true">06</span>
            Knowledge
          </button>
          <button
            className={`nav-item ${section === "news" ? "active" : ""}`}
            type="button"
            aria-current={section === "news" ? "page" : undefined}
            onClick={() => setSection("news")}
          >
            <span aria-hidden="true">07</span>
            News
          </button>
          {plannedSections.map((section, index) => (
            <span className="nav-item planned" key={section}>
              <span aria-hidden="true">0{index + 8}</span>
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

        {section === "home" ? (
          <DashboardHome accessToken={accessToken} onNavigate={setSection} />
        ) : section === "agents" ? (
          <AgentWorkspace
            accessToken={accessToken}
            canManage={user.role !== "MEMBER"}
          />
        ) : section === "chat" ? (
          <ChatWorkspace accessToken={accessToken} />
        ) : section === "analytics" ? (
          <AnalyticsWorkspace accessToken={accessToken} />
        ) : section === "gmail" ? (
          <GmailWorkspace accessToken={accessToken} />
        ) : section === "news" ? (
          <NewsWorkspace
            accessToken={accessToken}
            canManage={user.role !== "MEMBER"}
          />
        ) : (
          <KnowledgeWorkspace
            accessToken={accessToken}
            canManage={user.role !== "MEMBER"}
          />
        )}
      </main>
    </div>
  );
}

function isDashboardSection(value: string | null): value is DashboardSection {
  return (
    value === "home" ||
    value === "agents" ||
    value === "chat" ||
    value === "analytics" ||
    value === "knowledge" ||
    value === "gmail" ||
    value === "news"
  );
}
