"use client";

import { Shell } from "./shell";
import type { AppCard, SessionPayload } from "./types";

function StatusBadge({ status }: { status: AppCard["status"] }) {
  const label =
    status === "active" ? "Active" : status === "unbound" ? "Not set up" : "Coming soon";
  return <span className={`app-badge app-badge-${status}`}>{label}</span>;
}

function greeting(session: SessionPayload) {
  const user = session.user;
  return user?.displayName || user?.username || user?.email || "there";
}

function AppTile({ app }: { app: AppCard }) {
  const disabled = app.status === "disabled";
  const actionLabel = app.status === "active" ? "Open" : app.bindable ? "Set up" : "Open";
  const description =
    app.status === "active"
      ? "Active and ready to use."
      : app.status === "unbound"
        ? "Enter your invite to activate."
        : "Available soon.";

  const tile = (
    <article className={`section-card app-card${disabled ? " app-card-disabled" : ""}`}>
      <div className="app-card-head">
        <h2>{app.name}</h2>
        <StatusBadge status={app.status} />
      </div>
      <p className="muted">
        {description}
        {app.secondaryAuth ? " Requires a separate sign-in." : ""}
      </p>
      <span className="btn btn-secondary app-card-action" aria-disabled={disabled}>
        {actionLabel}
      </span>
    </article>
  );

  if (disabled || !app.href) {
    return tile;
  }
  const external = app.href.startsWith("http");
  return (
    <a
      className="app-card-link"
      href={app.href}
      {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
    >
      {tile}
    </a>
  );
}

export function Launcher({ session }: { session: SessionPayload }) {
  const apps = session.apps ?? [];
  return (
    <Shell>
      <div className="page-stack">
        <header className="page-header launcher-greeting">
          {session.user?.avatarUrl ? (
            <img
              className="launcher-avatar"
              src={session.user.avatarUrl}
              alt=""
              width={48}
              height={48}
            />
          ) : null}
          <div>
            <h1>Welcome, {greeting(session)}</h1>
            <p>Choose an application to open or set up.</p>
          </div>
        </header>
        <section className="card-grid">
          {apps.map((app) => (
            <AppTile key={app.key} app={app} />
          ))}
        </section>
      </div>
    </Shell>
  );
}
