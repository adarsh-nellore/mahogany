"use client";

import { useEffect } from "react";
import { useRouter, useParams } from "next/navigation";

export default function DigestDetailRedirect() {
  const router = useRouter();
  const { id } = useParams();
  useEffect(() => { router.replace(`/digest/${id}`); }, [router, id]);
  return null;
}
