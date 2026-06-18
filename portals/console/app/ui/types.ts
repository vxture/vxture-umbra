export interface VxtureUser {
  id: string;
  email: string;
  emailVerified?: boolean;
  phone?: string;
  phoneVerified?: boolean;
  accountStatus?: string;
  orgId?: string;
  workspaceId?: string;
  roles?: string[];
  userType?: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  tenantId: string;
  role: string;
  permissions: string[];
  provider: string;
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
  usagePercent: number;
  resetText: string;
  lastClient: string;
  subUpdatedText: string;
  createdText: string;
  lifetimeUsedText: string;
}

export interface SessionPayload {
  status: "anonymous" | "active";
  loginUrl?: string;
  user?: VxtureUser;
  account?: AccountBinding | null;
}
