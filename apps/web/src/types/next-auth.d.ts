import "next-auth";

declare module "next-auth" {
  interface Session {
    user?: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      householdId?: string;
    };
  }

  interface User {
    householdId?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    householdId?: string;
  }
}
