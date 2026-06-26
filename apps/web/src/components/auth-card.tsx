import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface AuthCardProps {
  mode: "login" | "signup";
  action: (formData: FormData) => Promise<void>;
  error?: string;
  next?: string;
}

export function AuthCard({ mode, action, error, next }: AuthCardProps) {
  const isLogin = mode === "login";
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <Card className="w-full max-w-md p-8 shadow-soft">
        <div className="mb-8">
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-primary text-lg font-bold text-white">
            S
          </div>
          <h1 className="text-2xl font-bold">{isLogin ? "登录 SMOTA" : "创建账号"}</h1>
          <p className="mt-2 text-sm text-slate-500">
            {isLogin ? "进入你的 AI app builder 控制台。" : "使用邮箱密码创建一个工作台账号。"}
          </p>
        </div>
        {error ? (
          <div className="mb-4 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}
        <form action={action} className="space-y-4">
          {next ? <input type="hidden" name="next" value={next} /> : null}
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">邮箱</label>
            <Input name="email" type="email" required placeholder="you@example.com" />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">密码</label>
            <Input name="password" type="password" required minLength={6} placeholder="至少 6 位" />
          </div>
          <Button className="w-full" type="submit">
            {isLogin ? "登录" : "注册"}
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-slate-500">
          {isLogin ? "还没有账号？" : "已经有账号？"}
          <Link className="ml-1 font-semibold text-primary" href={isLogin ? "/auth/signup" : "/auth/login"}>
            {isLogin ? "去注册" : "去登录"}
          </Link>
        </p>
      </Card>
    </main>
  );
}
