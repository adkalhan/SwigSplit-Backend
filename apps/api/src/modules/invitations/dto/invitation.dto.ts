export type GroupInviteDto = {
  id: string;
  kind: "group";
  expiresAt: Date;
  signupUrl: string;
};

export type AppInviteDto = {
  id: string;
  kind: "app";
  expiresAt: Date;
  signupUrl: string;
};
