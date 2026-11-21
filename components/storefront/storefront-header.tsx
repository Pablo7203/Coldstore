import Link from "next/link";
import { ShoppingBag, Snowflake, UserRound } from "lucide-react";
import { CartCount } from "@/components/storefront/store-cart";
import { getAuthContext } from "@/lib/auth/authorization";

export async function StorefrontHeader() {
  const auth = await getAuthContext();
  const accountHref =
    auth?.type === "customer"
      ? "/account"
      : auth?.type === "staff"
        ? "/staff"
        : "/login?next=%2Faccount";
  const accountLabel =
    auth?.type === "customer"
      ? "My account"
      : auth?.type === "staff"
        ? "Staff workspace"
        : "Sign in";
  return (
    <header className="store-header border-b">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:gap-4 sm:px-8 sm:py-4">
        <Link href="/" className="store-brand" aria-label="Grand Pa’s Cold Store home">
          <span className="store-brand-mark">
            <Snowflake size={19} strokeWidth={1.8} />
          </span>
          <span className="leading-tight">
            <span className="block text-[15px] font-semibold tracking-[-0.03em]">
              Grand Pa’s
            </span>
            <span className="store-brand-sub hidden text-[10px] font-medium uppercase tracking-[0.15em] sm:block">
              Cold Store
            </span>
          </span>
        </Link>
        <nav
          aria-label="Main navigation"
          className="store-main-nav flex items-center gap-0.5 sm:gap-1 lg:gap-2"
        >
          <Link href="/shop" className="store-nav-link">
            Shop
          </Link>
          <Link href="/cart" className="store-nav-link inline-flex items-center gap-1.5">
            <ShoppingBag size={16} aria-hidden="true" />
            <span className="hidden sm:inline">Cart</span> <CartCount />
          </Link>
          <Link href="/#categories" className="store-nav-link hidden md:inline-flex">
            Categories
          </Link>
          <Link href="/#pickup" className="store-nav-link hidden lg:inline-flex">
            How it works
          </Link>
          <Link href="/#visit" className="store-nav-link hidden md:inline-flex">
            Find us
          </Link>
          <Link href={accountHref} className="store-nav-cta" aria-label={accountLabel}>
            <UserRound size={17} aria-hidden="true" />
            <span className="hidden sm:inline">{accountLabel}</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}
