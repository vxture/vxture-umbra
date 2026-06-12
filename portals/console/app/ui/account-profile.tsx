"use client";

import { Button, Icon, SectionCard } from "@vxture/design-system";
import { AccountGate } from "./account-gate";
import { SectionHeading } from "./shell";
import { PersonalInfo } from "./personal-info";

/** Personal-info detail page (reached from the header user menu). */
export function AccountProfile() {
  return (
    <AccountGate>
      {(session) => (
        <div className="page-stack">
          <SectionHeading
            icon="user"
            title="Personal info"
            description="Your Vxture account identity."
          />
          <SectionCard title="Account identity">
            <PersonalInfo user={session.user} />
          </SectionCard>
          <div className="actions">
            <Button variant="secondary" asChild>
              <a href="/">
                <Icon name="arrow-left" size="sm" />
                Back
              </a>
            </Button>
          </div>
        </div>
      )}
    </AccountGate>
  );
}
