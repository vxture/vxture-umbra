"use client";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  StatusBadge,
} from "@vxture/design-system";
import type { StatusBadgeTone } from "@vxture/design-system";
import { Shell } from "./shell";
import type { AppCard, SessionPayload } from "./types";

const STATUS: Record<AppCard["status"], { label: string; tone: StatusBadgeTone }> = {
  active: { label: "Active", tone: "success" },
  unbound: { label: "Not set up", tone: "neutral" },
  disabled: { label: "Coming soon", tone: "neutral" },
};

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
        <CardTitle>{app.name}</CardTitle>
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
  const avatarUrl = session.user?.avatarUrl;

  return (
    <Shell>
      <div className="page-stack">
        <header className="launcher-greeting">
          <Avatar>
            {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
            <AvatarFallback>{name.slice(0, 1).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div>
            <h1>Welcome, {name}</h1>
            <p className="muted">Choose an application to open or set up.</p>
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
