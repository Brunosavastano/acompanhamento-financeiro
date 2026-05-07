import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { WelcomeTransition } from "@/components/welcome-transition";

export default async function WelcomePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const welcome = resolveWelcome(session.user);
  return <WelcomeTransition displayName={welcome.displayName} greeting={welcome.greeting} />;
}

function resolveWelcome(user: { name?: string | null; email?: string | null }) {
  const name = user.name?.trim() ?? "";
  const email = user.email?.toLowerCase() ?? "";
  const identity = `${name} ${email}`.toLowerCase();

  if (identity.includes("tatiane") || identity.includes("tati")) {
    return { displayName: "Tatiane Savastano", greeting: "Bem-vinda" as const };
  }

  if (identity.includes("bruno")) {
    return { displayName: "Bruno Savastano", greeting: "Bem-vindo" as const };
  }

  return { displayName: name || "Savastano", greeting: "Bem-vindo" as const };
}
