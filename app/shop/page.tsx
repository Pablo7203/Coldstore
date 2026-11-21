import Link from "next/link";
import { ArrowRight, Search, Snowflake } from "lucide-react";
import { StorefrontHeader } from "@/components/storefront/storefront-header";
import { StoreProductCard } from "@/components/storefront/store-product-card";
import { createAdminClient } from "@/lib/supabase/admin";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ShopPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const queryValue = Array.isArray(params.q) ? params.q[0] : params.q;
  const categoryValue = Array.isArray(params.category)
    ? params.category[0]
    : params.category;
  const query = (queryValue ?? "").trim().slice(0, 80);

  let categories: { id: string; name: string; slug: string }[] = [];
  let products: {
    product_id: string;
    category_id: string;
    category_name: string;
    name: string;
    description: string | null;
    selling_price: number;
    image_path: string | null;
    available_to_order: number;
  }[] = [];
  let loadFailed = false;

  try {
    const client = createAdminClient();
    const categoryResult = await client
      .from("categories")
      .select("id, name, slug")
      .eq("is_active", true)
      .order("name");
    if (categoryResult.error) throw categoryResult.error;
    categories = categoryResult.data ?? [];

    const selectedCategory = categories.find(
      (category) => category.slug === categoryValue,
    );
    const productResult =
      categoryValue && !selectedCategory
        ? { data: [], error: null }
        : await client.rpc("get_orderable_catalog", {
            p_query: query,
            p_limit: 96,
            p_category_id: selectedCategory?.id ?? null,
          });
    if (productResult.error) throw productResult.error;
    products = (productResult.data ?? []).map((product) => ({
      product_id: product.product_id,
      category_id: product.category_id,
      category_name: product.category_name,
      name: product.name,
      description: product.description,
      selling_price: product.selling_price,
      image_path: product.image_path,
      available_to_order: product.available_to_order,
    }));
  } catch {
    loadFailed = true;
  }

  return (
    <main className="storefront min-h-svh">
      <StorefrontHeader />
      <section className="mx-auto max-w-7xl px-5 pb-20 pt-10 sm:px-8 sm:pt-14">
        <div className="flex flex-col gap-5 border-b pb-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="store-eyebrow">
              <Snowflake size={14} aria-hidden="true" />
              GRAND PA’S COLD STORE
            </p>
            <h1 className="mt-4 text-4xl font-semibold tracking-[-0.055em] sm:text-5xl">
              Shop frozen favourites
            </h1>
            <p className="store-muted mt-3 max-w-xl text-base leading-7">
              Choose from the current selection, then reserve your items for collection in
              Osu.
            </p>
          </div>
        </div>

        <form
          role="search"
          className="store-filter-bar mt-7 grid gap-3 p-3 sm:grid-cols-[minmax(14rem,1fr)_minmax(12rem,0.5fr)_auto]"
          action="/shop"
        >
          <label className="store-search-field">
            <Search size={18} aria-hidden="true" />
            <span className="sr-only">Search products</span>
            <input
              name="q"
              type="search"
              placeholder="Search products"
              defaultValue={query}
              maxLength={80}
            />
          </label>
          <label className="sr-only" htmlFor="shop-category">
            Filter by category
          </label>
          <select
            id="shop-category"
            className="store-select"
            name="category"
            defaultValue={categoryValue ?? ""}
          >
            <option value="">All categories</option>
            {categories.map((category) => (
              <option value={category.slug} key={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          <button type="submit" className="store-button-primary justify-center">
            Find products <ArrowRight size={16} />
          </button>
        </form>

        <div className="mt-8 flex items-center justify-between gap-4">
          <p className="store-muted text-sm">
            {loadFailed
              ? ""
              : `${products.length}${products.length === 96 ? "+" : ""} ${products.length === 1 ? "product" : "products"}`}
          </p>
          {categoryValue || query ? (
            <Link href="/shop" className="store-footer-link text-sm">
              Clear filters
            </Link>
          ) : null}
        </div>

        {loadFailed ? (
          <div className="store-empty-state mt-4" role="alert">
            <h2>We couldn’t load the catalogue.</h2>
            <p>Please refresh the page in a moment.</p>
          </div>
        ) : products.length ? (
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {products.map((product) => (
              <StoreProductCard key={product.product_id} product={product} />
            ))}
          </div>
        ) : (
          <div className="store-empty-state mt-4">
            <span className="store-empty-icon">
              <Snowflake size={24} />
            </span>
            <h2>
              {query || categoryValue
                ? "No products found"
                : "The shelves are being stocked."}
            </h2>
            <p>
              {query || categoryValue
                ? "Try a different search or category."
                : "Please check back soon for the current selection."}
            </p>
            {query || categoryValue ? (
              <Link href="/shop" className="store-footer-link mt-4">
                View all products <ArrowRight size={15} />
              </Link>
            ) : null}
          </div>
        )}
      </section>
      <footer className="border-t px-5 py-7 text-center text-sm sm:px-8">
        <p className="store-muted">Grand Pa’s Cold Store · Good food, kept cold.</p>
      </footer>
    </main>
  );
}
