import Link from "next/link";
import { ProductForm, CategoryForm } from "@/components/staff/catalog-forms";
import { StaffWorkspaceNav } from "@/components/staff/staff-workspace-nav";
import {
  getStockStatus,
  stockStatusLabels,
  stockStatusStyles,
} from "@/lib/inventory/stock-status";
import { formatGhs, formatQuantity } from "@/lib/inventory/format";
import { userHasPermission, requireStaffContext } from "@/lib/auth/authorization";
import { createClient } from "@/lib/supabase/server";
import { productFilterSchema } from "@/lib/validation/catalog";

const pageSize = 50;

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireStaffContext();
  const params = await searchParams;
  const get = (key: string) =>
    Array.isArray(params[key]) ? params[key]?.[0] : params[key];
  const parsed = productFilterSchema.safeParse({
    query: get("query") ?? "",
    categoryId: get("category") ?? "",
    active: get("active") ?? "all",
    page: get("page") ?? "1",
  });
  const filters = parsed.success
    ? parsed.data
    : { query: "", categoryId: "", active: "all" as const, page: 1 };
  const page = filters.page ?? 1;
  const client = await createClient();
  const [{ data: categories }, { data: products, error: productError }] =
    await Promise.all([
      client.from("categories").select("id, name, slug, is_active").order("name"),
      client.rpc("search_products", {
        p_query: filters.query || undefined,
        p_category_id: filters.categoryId || undefined,
        p_active: filters.active === "all" ? undefined : filters.active === "active",
        p_limit: pageSize,
        p_offset: (page - 1) * pageSize,
      }),
    ]);
  const canManage = await userHasPermission("manage_products");
  const canViewHistory = await userHasPermission("view_stock_history");
  const total = products?.[0]?.total_count ?? 0;
  const filterUrl = (nextPage: number) => {
    const query = new URLSearchParams();
    if (filters.query) query.set("query", filters.query);
    if (filters.categoryId) query.set("category", filters.categoryId);
    if (filters.active && filters.active !== "all") query.set("active", filters.active);
    if (nextPage > 1) query.set("page", String(nextPage));
    return `/products${query.size ? `?${query.toString()}` : ""}`;
  };

  return (
    <main className="min-h-svh bg-[#f7f4ec] px-4 py-6 text-[#1f2924] sm:px-8 sm:py-8">
      <div className="mx-auto max-w-7xl">
        <StaffWorkspaceNav active="/products" canViewHistory={canViewHistory} />
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#5e6b64]">
              Catalogue
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Products</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#5e6b64]">
              Keep product details and prices current. Stock is recorded separately as a
              movement ledger.
            </p>
          </div>
          <p className="rounded-full bg-white px-4 py-2 text-sm text-[#5e6b64] ring-1 ring-[#d7e0d9]">
            {total} product{total === 1 ? "" : "s"} found
          </p>
        </div>

        {canManage ? (
          <section className="mb-6 grid gap-5 xl:grid-cols-[1.25fr_1fr]">
            <div className="rounded-2xl border border-[#d7e0d9] bg-white p-5 sm:p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#5e6b64]">
                Product setup
              </p>
              <h2 className="mt-2 text-xl font-semibold">Add a product</h2>
              <p className="mb-5 mt-1 text-sm text-[#5e6b64]">
                Prices are stored as exact decimal values in GHS.
              </p>
              <ProductForm
                categories={(categories ?? []).filter((category) => category.is_active)}
              />
            </div>
            <div className="rounded-2xl border border-[#d7e0d9] bg-white p-5 sm:p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#5e6b64]">
                Product grouping
              </p>
              <h2 className="mb-4 mt-2 text-xl font-semibold">Categories</h2>
              <CategoryForm />
              <div className="mt-5 space-y-3">
                {(categories ?? []).map((category) => (
                  <details
                    key={category.id}
                    className="rounded-xl border border-[#d7e0d9] p-3"
                  >
                    <summary className="cursor-pointer list-inside list-disc text-sm font-medium text-[#153c33]">
                      {category.name}{" "}
                      <span className="font-normal text-[#5e6b64]">
                        · {category.is_active ? "Active" : "Inactive"}
                      </span>
                    </summary>
                    <div className="mt-3">
                      <CategoryForm category={category} />
                    </div>
                  </details>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        <section className="rounded-2xl border border-[#d7e0d9] bg-white p-5 sm:p-6">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Product catalogue</h2>
              <p className="mt-1 text-sm text-[#5e6b64]">
                Search by name, SKU, or barcode prefix.
              </p>
            </div>
          </div>
          <form
            method="get"
            className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(15rem,1fr)_minmax(12rem,0.7fr)_minmax(10rem,0.55fr)_auto]"
          >
            <label className="grid gap-1 text-xs font-semibold text-[#5e6b64]">
              Search
              <input
                className="min-h-11 rounded-lg border border-[#d7e0d9] px-3 text-sm font-normal outline-none focus:border-[#2f654f] focus:ring-2 focus:ring-[#2f654f]/20"
                name="query"
                defaultValue={filters.query}
                placeholder="Name, SKU or barcode"
                maxLength={100}
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-[#5e6b64]">
              Category
              <select
                className="min-h-11 rounded-lg border border-[#d7e0d9] bg-white px-3 text-sm font-normal outline-none focus:border-[#2f654f]"
                name="category"
                defaultValue={filters.categoryId ?? ""}
              >
                <option value="">All categories</option>
                {(categories ?? []).map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                    {category.is_active ? "" : " (inactive)"}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-semibold text-[#5e6b64]">
              Status
              <select
                className="min-h-11 rounded-lg border border-[#d7e0d9] bg-white px-3 text-sm font-normal outline-none focus:border-[#2f654f]"
                name="active"
                defaultValue={filters.active ?? "all"}
              >
                <option value="all">All products</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
            <button className="min-h-11 self-end rounded-lg border border-[#d7e0d9] bg-[#f7f4ec] px-5 text-sm font-semibold text-[#153c33] hover:bg-[#eaf2f3]">
              Apply filters
            </button>
          </form>

          {productError ? (
            <p
              role="alert"
              className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-900"
            >
              Product data could not be loaded. Refresh and try again.
            </p>
          ) : products?.length ? (
            <div className="overflow-x-auto rounded-xl border border-[#d7e0d9]">
              <table className="w-full min-w-[850px] border-collapse text-left text-sm">
                <thead className="bg-[#f7f4ec] text-xs uppercase tracking-wide text-[#5e6b64]">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Product</th>
                    <th className="px-4 py-3 font-semibold">Category</th>
                    <th className="px-4 py-3 font-semibold">SKU</th>
                    <th className="px-4 py-3 text-right font-semibold">Price</th>
                    <th className="px-4 py-3 text-right font-semibold">Stock</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Record</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#eaf2f3]">
                  {products.map((product) => {
                    const status = getStockStatus(
                      product.quantity,
                      product.reorder_level,
                      product.is_active,
                    );
                    return (
                      <tr key={product.id} className="hover:bg-[#fbfcfa]">
                        <td className="px-4 py-4">
                          <p className="font-semibold text-[#153c33]">{product.name}</p>
                          <p className="mt-1 line-clamp-1 text-xs text-[#5e6b64]">
                            {product.barcode
                              ? `Barcode ${product.barcode}`
                              : (product.description ?? "No description")}
                          </p>
                        </td>
                        <td className="px-4 py-4 text-[#5e6b64]">
                          {product.category_name}
                        </td>
                        <td className="px-4 py-4 font-mono text-xs text-[#5e6b64]">
                          {product.sku ?? "—"}
                        </td>
                        <td className="px-4 py-4 text-right font-medium tabular-nums">
                          {formatGhs(product.selling_price)}
                        </td>
                        <td className="px-4 py-4 text-right tabular-nums">
                          {formatQuantity(product.quantity)}{" "}
                          <span className="text-xs text-[#5e6b64]">
                            / {formatQuantity(product.reorder_level)}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${stockStatusStyles[status]}`}
                          >
                            {stockStatusLabels[status]}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          {canManage ? (
                            <Link
                              className="font-semibold text-[#2f654f] underline-offset-4 hover:underline"
                              href={`/products/${product.id}/edit`}
                            >
                              Edit
                            </Link>
                          ) : (
                            <span className="text-[#5e6b64]">View only</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-[#d7e0d9] bg-[#f7f4ec] px-5 py-12 text-center">
              <p className="font-medium text-[#153c33]">
                No products match these filters.
              </p>
              <p className="mt-1 text-sm text-[#5e6b64]">
                Try another search or add a product to the catalogue.
              </p>
            </div>
          )}

          <div className="mt-4 flex items-center justify-between text-sm text-[#5e6b64]">
            <span>
              Page {page}
              {total ? ` of ${Math.ceil(total / pageSize)}` : ""}
            </span>
            <div className="flex gap-2">
              {page > 1 ? (
                <Link
                  className="rounded-lg border border-[#d7e0d9] px-3 py-2 hover:bg-[#f7f4ec]"
                  href={filterUrl(page - 1)}
                >
                  Previous
                </Link>
              ) : null}
              {products?.length === pageSize ? (
                <Link
                  className="rounded-lg border border-[#d7e0d9] px-3 py-2 hover:bg-[#f7f4ec]"
                  href={filterUrl(page + 1)}
                >
                  Next
                </Link>
              ) : null}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
