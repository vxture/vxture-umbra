"use client";

import { AccountGate } from "./account-gate";
import { NetworkAccess } from "./network-access";

export function AccountApp({ initialInvite }: { initialInvite?: string }) {
  return (
    <AccountGate initialInvite={initialInvite}>
      {(session, setSession) => (
        <div className="page-stack">
          <NetworkAccess session={session} setSession={setSession} initialInvite={initialInvite} />
        </div>
      )}
    </AccountGate>
  );
}
