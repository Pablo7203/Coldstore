import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductForm } from "@/components/staff/catalog-forms";
import { StaffWorkspaceNav } from "@/components/staff/staff-workspace-nav";
import { requireStaffContext, userHasPermission } from "@/lib/auth/authorization";
import { createClient } from "@/lib/supabase/server";

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  await requireStaffContext();
  const { productId } = await params;
  if (!(await userHasPermission("manage_products"))) notFound();
  const client = await createClient();
  const [{ data: product }, { data: categories }, canViewHistory] = await Promise.all([
    client.from("products").select("*").eq("id", productId).maybeSingle(),
    client.from("categories").select("id, name, slug, is_active").order("name"),
    userHasPermission("view_stock_history"),
  ]);
  if (!product) notFound();
  const categoryOptions = (categories ?? []).filter(
    (category) => category.is_active || category.id === product.category_id,
  );

  return (
    <main className="min-h-svh bg-[#f7f4ec] px-4 py-6 text-[#1f2924] sm:px-8 sm:py-8">
      <div className="mx-auto max-w-4xl">
        <StaffWorkspaceNav active="/products" canViewHistory={canViewHistory} />
        <Link
          href="/products"
          className="text-sm font-semibold text-[#2f654f] hover:underline"
        >
          ← Back to products
        </Link>
        <section className="mt-5 rounded-2xl border border-[#d7e0d9] bg-white p-5 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#5e6b64]">
            Catalogue record
          </p>
          <h1 className="mt-2 text-2xl font-semibold">Edit {product.name}</h1>
          <p className="mb-6 mt-2 text-sm leading-6 text-[#5e6b64]">
            Products stay in the catalogue history. Deactivate a product when it should no
            longer be offered.
          </p>
          <ProductForm categories={categoryOptions} product={product} />
        </section>
      </div>
    </main>
  );
}
