import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Clock3,
  MapPin,
  PackageCheck,
  Search,
  Snowflake,
} from "lucide-react";
import { StoreProductCard } from "@/components/storefront/store-product-card";
import { StorefrontHeader } from "@/components/storefront/storefront-header";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";

type StoreCategory = Pick<
  Database["public"]["Tables"]["categories"]["Row"],
  "id" | "name" | "slug"
>;
type StoreProduct =
  Database["public"]["Functions"]["get_orderable_catalog"]["Returns"][number];

async function getStorefrontContent() {
  try {
    const client = createAdminClient();
    const [categoryResult, productResult] = await Promise.all([
      client
        .from("categories")
        .select("id, name, slug")
        .eq("is_active", true)
        .order("name")
        .limit(8),
      client.rpc("get_orderable_catalog", {
        p_query: "",
        p_limit: 4,
        p_category_id: null,
      }),
    ]);

    if (categoryResult.error || productResult.error) {
      throw new Error("Storefront content could not be loaded");
    }

    return {
      categories: (categoryResult.data ?? []) as StoreCategory[],
      products: (productResult.data ?? []) as StoreProduct[],
      loadFailed: false,
    };
  } catch {
    // Keep the public storefront useful when the catalogue service is unavailable.
    return {
      categories: [] as StoreCategory[],
      products: [] as StoreProduct[],
      loadFailed: true,
    };
  }
}

export default async function Home() {
  const { categories, products, loadFailed } = await getStorefrontContent();

  return (
    <main className="storefront min-h-svh">
      <p className="store-announcement">
        Pickup in Osu or delivery to your door. Track every delivery update.
      </p>
      <StorefrontHeader />

      <section className="store-home-hero mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-8 sm:py-14 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:gap-12 lg:py-16">
        <div className="storefront-enter max-w-xl">
          <p className="store-eyebrow">FROZEN FOOD IN OSU, ACCRA</p>
          <h1 className="store-home-title mt-5">Good food. Ready when you are.</h1>
          <p className="store-muted mt-5 max-w-md text-base leading-7 sm:text-lg">
            Browse the cold-store selection, choose pickup or delivery, and follow each
            delivery update from your account.
          </p>

          <form action="/shop" role="search" className="store-home-search mt-7">
            <Search size={19} aria-hidden="true" />
            <label htmlFor="home-search" className="sr-only">
              Search the shop
            </label>
            <input
              id="home-search"
              name="q"
              type="search"
              placeholder="Search chicken, fish, vegetables..."
              maxLength={80}
            />
            <button type="submit" className="store-search-button">
              Search
            </button>
          </form>

          <Link href="#categories" className="store-home-category-link mt-5">
            Browse by category <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>

        <div className="store-hero-frame storefront-enter storefront-enter-later">
          <div className="store-hero-photo relative min-h-[300px] overflow-hidden rounded-2xl sm:min-h-[420px] lg:min-h-[470px]">
            <Image
              src="/storefront-freezer.png"
              alt="Frozen chicken and fish in a cold-store display freezer"
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 55vw"
              className="object-cover"
            />
          </div>
          <p className="store-photo-note">
            <PackageCheck size={16} aria-hidden="true" />
            Pickup or door-to-door delivery
          </p>
        </div>
      </section>

      <section
        id="categories"
        className="store-home-section mx-auto max-w-7xl px-4 py-12 sm:px-8 sm:py-16"
      >
        <div className="store-section-heading">
          <div>
            <h2>Shop by category</h2>
            <p className="store-muted">
              Find frozen staples, seafood, and everyday cuts.
            </p>
          </div>
        </div>

        {categories.length ? (
          <div className="store-category-grid mt-7">
            {categories.map((category) => (
              <Link
                key={category.id}
                href={`/shop?category=${encodeURIComponent(category.slug)}`}
                className="store-category-tile"
              >
                <span className="store-category-icon" aria-hidden="true">
                  <Snowflake size={21} />
                </span>
                <span className="store-category-name">{category.name}</span>
                <ArrowRight className="store-category-go" size={17} aria-hidden="true" />
              </Link>
            ))}
          </div>
        ) : (
          <div
            className="store-section-empty mt-7"
            role={loadFailed ? "alert" : undefined}
          >
            <Snowflake size={20} aria-hidden="true" />
            <p>
              {loadFailed
                ? "We could not load the catalogue just now. Please try again shortly."
                : "Categories are being prepared. Browse the shop to see the current selection."}
            </p>
            <Link href="/shop" className="store-text-link">
              Browse products <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </div>
        )}
      </section>

      <section className="store-home-products px-4 py-12 sm:px-8 sm:py-16">
        <div className="mx-auto max-w-7xl">
          <div className="store-section-heading">
            <div>
              <h2>Available to order</h2>
              <p className="store-muted">
                Prices are shown in Ghana cedis. Delivery fees are confirmed before
                dispatch.
              </p>
            </div>
            <Link href="/shop" className="store-text-link">
              Browse the catalogue <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>

          {loadFailed ? (
            <div className="store-featured-empty mt-7" role="alert">
              <div>
                <h3>The catalogue is temporarily unavailable.</h3>
                <p>Please try again in a moment.</p>
              </div>
              <Link href="/shop" className="store-button-quiet">
                Open the shop <ArrowRight size={15} aria-hidden="true" />
              </Link>
            </div>
          ) : products.length ? (
            <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {products.map((product) => (
                <StoreProductCard
                  key={product.product_id}
                  product={product}
                  className="store-featured-card"
                />
              ))}
            </div>
          ) : (
            <div className="store-featured-empty mt-7">
              <div>
                <h3>There are no products available to order right now.</h3>
                <p>Please check the shop again soon.</p>
              </div>
              <Link href="/shop" className="store-button-quiet">
                View the shop <ArrowRight size={15} aria-hidden="true" />
              </Link>
            </div>
          )}
        </div>
      </section>

      <section
        id="pickup"
        className="store-pickup-section mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-8 sm:py-16 lg:grid-cols-2"
      >
        <div>
          <h2>Pickup or delivery. You choose.</h2>
          <p className="store-muted mt-3 max-w-xl leading-7">
            Reserve items for collection in Osu or request delivery to your address. For
            delivery, staff confirm availability and the fee before preparing your order.
          </p>
          <ol className="store-pickup-list mt-7">
            <li>
              <span className="store-pickup-icon" aria-hidden="true">
                <Search size={18} />
              </span>
              <span>
                <strong>Choose your items</strong>
                <small>Browse current products and check their prices.</small>
              </span>
            </li>
            <li>
              <span className="store-pickup-icon" aria-hidden="true">
                <PackageCheck size={18} />
              </span>
              <span>
                <strong>Choose pickup or delivery</strong>
                <small>Sign in, then enter your delivery address if needed.</small>
              </span>
            </li>
            <li>
              <span className="store-pickup-icon" aria-hidden="true">
                <Clock3 size={18} />
              </span>
              <span>
                <strong>Approve and follow delivery</strong>
                <small>
                  Accept the quoted fee, then follow staff updates until it arrives.
                </small>
              </span>
            </li>
          </ol>
        </div>

        <aside id="visit" className="store-location-card">
          <span className="store-location-icon" aria-hidden="true">
            <MapPin size={20} />
          </span>
          <h3>Collect in Osu</h3>
          <p className="store-location-address">Osu, Accra, Ghana</p>
          <p className="store-muted mt-2 text-sm leading-6">
            Street address and opening hours will be confirmed soon.
          </p>
          <a
            href="https://www.google.com/maps/search/?api=1&query=Osu%2C+Accra%2C+Ghana"
            target="_blank"
            rel="noreferrer"
            className="store-text-link mt-5"
          >
            Explore Osu on Google Maps <ArrowRight size={15} aria-hidden="true" />
          </a>
        </aside>
      </section>

      <section className="store-home-faq px-4 py-12 sm:px-8 sm:py-16">
        <div className="mx-auto grid max-w-7xl gap-8 md:grid-cols-[0.7fr_1.3fr]">
          <div>
            <h2>Before you order</h2>
            <p className="store-muted mt-3 max-w-sm leading-6">
              Sign in to place orders and track deliveries from your account.
            </p>
            <Link href="/login?next=%2Faccount" className="store-text-link mt-5">
              Go to my account <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
          <div className="store-faq-list">
            <details>
              <summary>Can I browse without an account?</summary>
              <p>
                Yes. Browse the catalogue without signing in. You need a customer account
                to place orders. Delivery orders include a staff fee quote and a tracking
                timeline.
              </p>
            </details>
            <details>
              <summary>How do I pay for my order?</summary>
              <p>
                Pay cash at pickup or when your delivery arrives. The delivery fee is
                shown and approved before staff prepare the order.
              </p>
            </details>
            <details>
              <summary>Where can I collect my order?</summary>
              <p>
                Choose store pickup in Osu or enter your delivery address at checkout.
                Staff confirm delivery availability and the fee before preparation.
              </p>
            </details>
            <details>
              <summary>Will every product always be available?</summary>
              <p>
                Availability can change. The shop shows items currently available to order
                and checks stock again at checkout.
              </p>
            </details>
          </div>
        </div>
      </section>

      <footer className="store-footer border-t px-4 py-7 sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/" className="store-brand" aria-label="Grand Pa’s Cold Store home">
            <span className="store-brand-mark">
              <Snowflake size={18} aria-hidden="true" />
            </span>
            <span className="leading-tight">
              <span className="block text-sm font-semibold">Grand Pa’s</span>
              <span className="store-brand-sub block text-[10px] font-medium uppercase tracking-[0.15em]">
                Cold Store
              </span>
            </span>
          </Link>
          <nav
            aria-label="Footer navigation"
            className="flex flex-wrap gap-x-5 gap-y-2 text-sm"
          >
            <Link href="/shop" className="store-footer-link">
              Shop
            </Link>
            <Link href="/#pickup" className="store-footer-link">
              How it works
            </Link>
            <Link href="/#visit" className="store-footer-link">
              Find us
            </Link>
            <Link href="/login?next=%2Faccount" className="store-footer-link">
              My account
            </Link>
          </nav>
          <p className="store-muted text-xs">
            © {new Date().getFullYear()} Grand Pa’s Cold Store
          </p>
        </div>
      </footer>
    </main>
  );
}
