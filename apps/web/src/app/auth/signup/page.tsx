import { signUpAction } from "@/app/actions/auth";
import { AuthCard } from "@/components/auth-card";

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  return <AuthCard mode="signup" action={signUpAction} error={params.error} />;
}
