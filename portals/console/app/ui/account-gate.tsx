"use client";

import { useEffect, useState } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { Button, Icon, Skeleton } from "@vxture/design-system";
import { PageHeader, Shell } from "./shell";
import { fetchJson, ssoStartUrl } from "./api";
import type { SessionPayload } from "./types";

/**
 * Session gate shared by every console page (home, personal info, subscription
 * details). Loads /api/account/session once, renders the loading skeleton and
 * the anonymous sign-in inside the Shell, and hands the active session to
 * `children` (which provide the page content rendered inside the Shell main).
 */
export function AccountGate({
  initialInvite,
  children,
}: {
  initialInvite?: string;
  children: (
    session: SessionPayload,
    setSession: Dispatch<SetStateAction<SessionPayload | null>>,
  ) => ReactNode;
}) {
  const [session, setSession] = useState<SessionPayload | null>(null);

  async function refresh() {
    setSession(await fetchJson<SessionPayload>("/api/account/session"));
  }

  useEffect(() => {
    refresh().catch(() => setSession({ status: "anonymous" }));
  }, []);

  if (!session) {
    return (
      <Shell>
        <section className="auth-card page-stack">
          <Skeleton variant="line" lines={3} />
        </section>
      </Shell>
    );
  }

  if (session.status === "anonymous") {
    return (
      <Shell>
        <section className="auth-card page-stack">
          <PageHeader
            icon="user"
            title="Sign in with Vxture"
            description="Use your unified Vxture account to access your Ruyin console."
          />
          <div className="actions">
            <Button asChild>
              <a href={ssoStartUrl(session, initialInvite)}>
                Continue with Vxture
                <Icon name="arrow-right" size="sm" />
              </a>
            </Button>
          </div>
          <p className="muted">
            After signing in you can activate your network access with the invite code from your
            administrator.
          </p>
        </section>
      </Shell>
    );
  }

  return <Shell user={session.user}>{children(session, setSession)}</Shell>;
}
