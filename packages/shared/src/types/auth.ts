export const USER_ROLES = ["customer", "admin", "super_admin"] as const;

export type UserRole = (typeof USER_ROLES)[number];

export type AuthenticatedUser = {
  id: string;
  email: string;
  role: UserRole;
  emailVerifiedAt: string | null;
};

export type TokenPair = {
  accessToken: string;
  refreshToken: string;
};
