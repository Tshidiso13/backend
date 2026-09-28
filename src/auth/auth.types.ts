export type UserRole = "CUSTOMER" | "ADMIN";

export type AccessTokenPayload = {
  sub: string;
  email: string;
  role: UserRole;
  type: "access";
};

export type RefreshTokenPayload = {
  sub: string;
  sid: string;
  type: "refresh";
};

export type AuthenticatedUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  image: string | null;
  emailVerified: boolean;
};

export type GoogleProfile = {
  googleId: string;
  email: string;
  name: string;
  image?: string | null;
};