"use client";

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Icon,
  StatusBadge,
} from "@vxture/design-system";
import type { IconName, StatusBadgeTone } from "@vxture/design-system";
import { PageHeader, Shell } from "./shell";
import type { AppCard, SessionPayload } from "./types";

const STATUS: Record<AppCard["status"], { label: string; tone: StatusBadgeTone }> = {
  active: { label: "Active", tone: "success" },
  unbound: { label: "Not set up", tone: "neutral" },
  disabled: { label: "Coming soon", tone: "neutral" },
};

/** Per-app glyph (Phosphor). Unknown keys fall back to the generic app grid. */
const APP_ICON: Record<string, IconName> = {
  vpn: "shield-check",
  vault: "key",
};

function appIcon(key: string): IconName {
  return APP_ICON[key] ?? "app-grid";
}

function greeting(session: SessionPayload): string {
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
  const status = STATUS[app.status];
  const external = app.href.startsWith("http");

  return (
    <Card className="app-tile">
      <CardHeader className="app-tile-head">
        <CardTitle className="app-tile-title">
          <Icon name={appIcon(app.key)} size="sm" />
          {app.name}
        </CardTitle>
        <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
      </CardHeader>
      <CardContent className="app-tile-body">
        <CardDescription>
          {description}
          {app.secondaryAuth ? " Requires a separate sign-in." : ""}
        </CardDescription>
        {disabled || !app.href ? (
          <Button variant="secondary" disabled>
            {actionLabel}
          </Button>
        ) : (
          <Button variant="secondary" asChild>
            <a href={app.href} {...(external ? { target: "_blank", rel: "noreferrer" } : {})}>
              {actionLabel}
              <Icon name="arrow-right" size="sm" />
            </a>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export function Launcher({ session }: { session: SessionPayload }) {
  const apps = session.apps ?? [];
  const name = greeting(session);

  return (
    <Shell user={session.user}>
      <div className="page-stack">
        <PageHeader
          icon="app-grid"
          title={`Welcome, ${name}`}
          description="Choose an application to open or set up."
        />
        <section className="card-grid">
          {apps.map((app) => (
            <AppTile key={app.key} app={app} />
          ))}
        </section>
      </div>
    </Shell>
  );
}
