import { AccountApp } from "../../ui/account-app";

export default async function VpnPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string | string[] }>;
}) {
  const params = await searchParams;
  const raw = Array.isArray(params.invite) ? params.invite[0] : params.invite;
  const invite = typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
  return <AccountApp initialView="vpn" initialInvite={invite} />;
}
