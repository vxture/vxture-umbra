"use client";

import { Button, Icon } from "@vxture/design-system";
import { useTranslations } from "@umbra/shared/i18n";
import { AccountGate } from "./account-gate";
import { SectionHeading } from "./shell";
import { PersonalInfo } from "./personal-info";

/** Personal-info detail page (reached from the header user menu). */
export function AccountProfile() {
  const t = useTranslations("profile");
  return (
    <AccountGate>
      {(session) => (
        <div className="page-stack">
          <SectionHeading
            icon="user"
            title={t("title")}
            description={t("description")}
          />
          <PersonalInfo user={session.user} />
          <div className="actions">
            <Button variant="secondary" asChild>
              <a href="/">
                <Icon name="arrow-left" size="sm" />
                {t("back")}
              </a>
            </Button>
          </div>
        </div>
      )}
    </AccountGate>
  );
}
