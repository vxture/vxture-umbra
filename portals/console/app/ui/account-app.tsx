"use client";

import { useEffect, useState } from "react";
import { Shell } from "./shell";
import { fetchJson, ssoStartUrl } from "./api";
import { Launcher } from "./launcher";
import { VpnApp } from "./vpn-app";
import type { SessionPayload } from "./types";

type View = "home" | "vpn";

export function AccountApp({
  initialView,
  initialInvite,
}: {
  initialView: View;
  initialInvite?: string;
}) {
  const [session, setSession] = useState<SessionPayload | null>(null);

  async function refresh() {
    const next = await fetchJson<SessionPayload>("/api/account/session");
    setSession(next);
  }

  useEffect(() => {
    refresh().catch(() => setSession({ status: "anonymous" }));
  }, []);

  if (!session) {
    return (
      <Shell>
        <section className="section-card auth-card">Loading...</section>
      </Shell>
    );
  }

  if (session.status === "anonymous") {
    return (
      <Shell>
        <section className="section-card auth-card page-stack">
          <header className="page-header">
            <h1>Sign in with Vxture</h1>
            <p>Use your unified Vxture account to access Ruyin applications.</p>
          </header>
          <a className="btn btn-primary" href={ssoStartUrl(session, initialInvite)}>
            Continue with Vxture
          </a>
          <p className="muted">
            After signing in you can set up VPN with the invite code from your administrator.
          </p>
        </section>
      </Shell>
    );
  }

  if (initialView === "vpn") {
    return <VpnApp session={session} setSession={setSession} initialInvite={initialInvite} />;
  }

  return <Launcher session={session} />;
}
