"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function DigestsRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/digest"); }, [router]);
  return null;
}
