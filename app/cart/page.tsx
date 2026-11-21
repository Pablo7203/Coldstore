import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { StorefrontHeader } from "@/components/storefront/storefront-header";
import { CartContents } from "@/components/storefront/store-cart";

export default function CartPage() {
  return (
    <main className="storefront min-h-svh">
      <StorefrontHeader />
      <section className="mx-auto max-w-7xl px-5 py-10 sm:px-8 sm:py-14">
        <Link href="/shop" className="store-footer-link inline-flex items-center gap-2">
          <ArrowLeft size={15} /> Continue shopping
        </Link>
        <p className="store-eyebrow mt-7">YOUR SELECTION</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.055em]">Shopping cart</h1>
        <CartContents />
      </section>
    </main>
  );
}
