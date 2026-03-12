import { NextRequest, NextResponse } from "next/server";
import { searchProducts } from "@/lib/productSearch";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") || "";
  const domain = (searchParams.get("domain") || "both") as "pharma" | "devices" | "both";

  if (!q || q.trim().length < 2) {
    return NextResponse.json({ results: [] });
  }

  try {
    const results = await searchProducts(q.trim(), domain);
    return NextResponse.json({ results });
  } catch (err) {
    console.error("[api/products/search] error:", err);
    return NextResponse.json(
      { error: "Product search failed", details: String(err) },
      { status: 500 }
    );
  }
}
