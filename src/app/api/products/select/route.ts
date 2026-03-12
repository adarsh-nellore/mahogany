import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { upsertEntity, updateEntityMetadata } from "@/lib/entityResolver";
import type { ProductSearchResult } from "@/lib/productSearch";
import type { WatchType } from "@/lib/types";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      profile_id,
      product,
      watch_type = "exact",
    }: {
      profile_id: string;
      product: ProductSearchResult;
      watch_type: WatchType;
    } = body;

    if (!profile_id || !product?.name) {
      return NextResponse.json({ error: "profile_id and product.name required" }, { status: 400 });
    }

    let entityId: string;
    let canonicalName: string;

    if (product.entity_id) {
      entityId = product.entity_id;
      canonicalName = product.name;
      // Update entity metadata when selecting from search (product_code, advisory_committee, etc.)
      await updateEntityMetadata(product.entity_id, {
        regulatory_id: product.regulatory_id,
        company: product.company,
        generic_name: product.generic_name,
        product_type: product.product_type,
        domain: product.domain,
        region: product.region,
        source_api: product.source,
        product_code: product.product_code,
        advisory_committee: product.advisory_committee,
        device_class: product.device_class,
      });
    } else {
      const result = await upsertEntity("product", product.name, "product_search", {
        regulatory_id: product.regulatory_id,
        company: product.company,
        generic_name: product.generic_name,
        product_type: product.product_type,
        domain: product.domain,
        region: product.region,
        source_api: product.source,
        product_code: product.product_code,
        advisory_committee: product.advisory_committee,
        device_class: product.device_class,
      });
      entityId = result.entity_id;
      canonicalName = result.canonical_name;
    }

    // Upsert watch item
    const priority = watch_type === "exact" ? 90 : 70;
    const rows = await query<{ id: string }>(
      `INSERT INTO profile_watch_items (profile_id, entity_id, watch_type, priority, status)
       VALUES ($1, $2, $3, $4, 'active')
       ON CONFLICT (profile_id, entity_id, watch_type) DO UPDATE SET status = 'active'
       RETURNING id`,
      [profile_id, entityId, watch_type, priority]
    );

    // Update profile tracked_products or competitors
    if (watch_type === "exact") {
      await query(
        `UPDATE profiles
         SET tracked_products = array_append(
           CASE WHEN NOT ($2 = ANY(tracked_products)) THEN tracked_products ELSE tracked_products END,
           CASE WHEN NOT ($2 = ANY(tracked_products)) THEN $2 ELSE NULL END
         ),
         updated_at = now()
         WHERE id = $1 AND NOT ($2 = ANY(tracked_products))`,
        [profile_id, canonicalName]
      );
    } else if (watch_type === "competitor" && product.company) {
      await query(
        `UPDATE profiles
         SET competitors = array_append(
           CASE WHEN NOT ($2 = ANY(competitors)) THEN competitors ELSE competitors END,
           CASE WHEN NOT ($2 = ANY(competitors)) THEN $2 ELSE NULL END
         ),
         updated_at = now()
         WHERE id = $1 AND NOT ($2 = ANY(competitors))`,
        [profile_id, product.company]
      );
    }

    // Fetch full item to return
    const items = await query<{
      id: string; entity_id: string; canonical_name: string; entity_type: string;
      watch_type: string; status: string;
    }>(
      `SELECT pwi.id, pwi.entity_id, e.canonical_name, e.entity_type, pwi.watch_type,
              COALESCE(pwi.status, 'active') AS status
       FROM profile_watch_items pwi
       JOIN entities e ON e.id = pwi.entity_id
       WHERE pwi.id = $1`,
      [rows[0].id]
    );

    return NextResponse.json({ item: items[0] });
  } catch (err) {
    console.error("[api/products/select] error:", err);
    return NextResponse.json(
      { error: "Product selection failed", details: String(err) },
      { status: 500 }
    );
  }
}
