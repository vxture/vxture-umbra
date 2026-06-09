export interface VxtureUser {
  id: string;
  email: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  tenantId: string;
  role: string;
  permissions: string[];
  provider: string;
}

export interface AppCard {
  key: string;
  name: string;
  href: string;
  bindable: boolean;
  secondaryAuth: boolean;
  status: "active" | "unbound" | "disabled";
}

export interface AccountBinding {
  username: string;
  displayName: string;
  profileName: string;
  subscriptionUrl: string;
  status: string;
  usedTraffic: number;
  dataLimit: number;
  remainingTraffic: number;
  expire: number | null;
  onlineAt: string | null;
  usedText: string;
  dataLimitText: string;
  remainingText: string;
  expireText: string;
  onlineText: string;
}

export interface SessionPayload {
  status: "anonymous" | "active";
  loginUrl?: string;
  ssoUrl?: string;
  user?: VxtureUser;
  account?: AccountBinding | null;
  apps?: AppCard[];
}

export interface AdminUserRow {
  username: string;
  status: string;
  usedText: string;
  dataLimitText: string;
  expireText: string;
  onlineText: string;
  bindingState: "bound" | "invite_pending" | "pending_binding";
  displayName: string | null;
  inviteCode: string | null;
  inviteUrl: string | null;
  inviteId: number | null;
  subscriptionUrl: string | null;
}

export interface AdminInvitesPayload {
  status: "ok" | "admin_login_required" | "marzban_unavailable" | "forbidden";
  users: AdminUserRow[];
  summary: {
    users: number;
    bound: number;
    invitePending: number;
    pendingBinding: number;
  };
}
