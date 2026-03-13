"use client";

import { usePathname } from "next/navigation";
import ChatWidget from "./ChatWidget";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <>
      {children}
      {pathname !== "/" && <ChatWidget />}
    </>
  );
}
