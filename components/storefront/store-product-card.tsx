import Image from "next/image";
import Link from "next/link";
import { Snowflake } from "lucide-react";
import { AddToCartButton } from "@/components/storefront/store-cart";
import { formatGhs } from "@/lib/inventory/format";

export type StoreProduct = {
  product_id: string;
  category_id: string;
  category_name: string;
  name: string;
  description: string | null;
  selling_price: number;
  image_path: string | null;
  available_to_order: number;
};

export function StoreProductCard({
  product,
  className = "",
}: {
  product: StoreProduct;
  className?: string;
}) {
  const productHref = `/shop?q=${encodeURIComponent(product.name)}`;

  return (
    <article className={`store-product-card ${className}`}>
      <Link
        href={productHref}
        className={`store-product-art store-product-art-0${product.image_path ? " has-image" : ""}`}
        aria-label={`View ${product.name} in the shop`}
      >
        {product.image_path ? (
          <Image
            src={product.image_path}
            alt=""
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
            className="object-cover"
          />
        ) : (
          <Snowflake size={39} strokeWidth={1.15} aria-hidden="true" />
        )}
      </Link>

      <div className="store-product-card-content">
        <p className="store-product-category">{product.category_name}</p>
        <h3 className="store-product-title">
          <Link href={productHref}>{product.name}</Link>
        </h3>
        {product.description ? (
          <p className="store-muted store-product-description">{product.description}</p>
        ) : null}
        <div className="store-product-price-row">
          <strong>{formatGhs(product.selling_price)}</strong>
          <span>Pickup in store</span>
        </div>
        <AddToCartButton
          product={{
            id: product.product_id,
            name: product.name,
            price: product.selling_price,
            imagePath: product.image_path,
          }}
          maxQuantity={product.available_to_order}
          className="mt-4 w-full"
        />
      </div>
    </article>
  );
}
