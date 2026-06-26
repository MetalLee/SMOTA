import { signInAction } from "@/app/actions/auth";
import { AuthCard } from "@/components/auth-card";

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;
  return <AuthCard mode="login" action={signInAction} error={params.error} next={params.next} />;
}
