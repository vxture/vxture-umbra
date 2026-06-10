"use client";

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Icon,
  PageHeader,
} from "@vxture/design-system";
import type { IconName } from "@vxture/design-system";
import { AdminShell } from "./admin-shell";

interface Tool {
  title: string;
  description: string;
  href: string;
  action: string;
  icon: IconName;
}

const TOOLS: Tool[] = [
  {
    title: "VPN Management",
    description: "Manage users, traffic, and proxy settings in the Marzban dashboard.",
    href: "/dashboard/",
    action: "Open Marzban",
    icon: "shield-check",
  },
  {
    title: "Password Management",
    description: "Manage credentials and shared vaults in the Vaultwarden admin panel.",
    href: "https://pass.ruyin.ai/admin",
    action: "Open Vaultwarden",
    icon: "key",
  },
];

export function AdminHome() {
  return (
    <AdminShell active="overview">
      <div className="admin-stack">
        <PageHeader
          title="Ruyin Admin"
          description="Platform operations hub. Manage VPN access, invites, and passwords."
        />
        <section className="admin-tool-grid">
          {TOOLS.map((tool) => (
            <Card key={tool.title}>
              <CardHeader className="admin-tool-head">
                <span className="admin-tool-icon" aria-hidden="true">
                  <Icon name={tool.icon} size="lg" />
                </span>
                <CardTitle>{tool.title}</CardTitle>
              </CardHeader>
              <CardContent className="admin-tool-body">
                <CardDescription>{tool.description}</CardDescription>
                <Button variant="secondary" asChild>
                  <a href={tool.href} target="_blank" rel="noopener noreferrer">
                    {tool.action}
                  </a>
                </Button>
              </CardContent>
            </Card>
          ))}
        </section>
      </div>
    </AdminShell>
  );
}
