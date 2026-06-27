import type { Metadata } from "next";
import { Suspense } from "react";
import { RouteLoadingProvider } from "@/components/route-loading";
import "./globals.css";

export const metadata: Metadata = {
  title: "SMOTA",
  description: "Atoms-like AI app builder console"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        <Suspense fallback={children}>
          <RouteLoadingProvider>{children}</RouteLoadingProvider>
        </Suspense>
      </body>
    </html>
  );
}
