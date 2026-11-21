# GrandPa demo product catalogue

The development catalogue contains 30 cold-store products across poultry, beef and goat, pork, fish, seafood, and frozen staples. Product photos are local WebP assets in `public/products/`.

Old Phase 2 sample rows and Phase 6/7 synthetic test products are marked inactive so they no longer appear in the active catalog. Their product rows, stock movements, and transaction history are retained.

Prices are **indicative Ghana cedi demo retail prices**, not live quotes or supplier commitments. Pack sizes are stated in each product description; actual vendor prices vary with source, size, brand, and date. The values were rounded to practical storefront amounts using Ghana online retail listings checked on 14 October 2026. Observed examples include chicken portions around GH₵40–60/kg, mackerel around GH₵50/kg, hake around GH₵42/kg, tilapia around GH₵84/kg, goat around GH₵115/kg, and shrimp around GH₵150/kg. Premium and less commonly listed items use clearly illustrative estimates.

Reference listings:

- [GhFruit Ghana — fish and meat](https://ghfruit.com/product-category/fish-meat/)
- [Nautica Select — shop](https://www.nauticaselect.com/shop)
- [Rabah Foods Ghana](https://www.rabahfoods.com/)

The catalogue sets `cost_price` to null and `reorder_level` to zero because supplier costs and actual replenishment policy have not been provided. For the school-project checkout demonstration only, the development seed and `20261014110000_seed_school_demo_opening_stock.sql` add 10 units per product as immutable, explicitly labelled demo opening movements. These are not a physical stock count and must be replaced with actual counts before any real use. Stock quantities continue to come from the inventory movement ledger.
