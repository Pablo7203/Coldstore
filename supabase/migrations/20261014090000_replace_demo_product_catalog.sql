-- Replace the original fictional DEV-* catalogue with the GrandPa demo catalogue.
-- Product rows are upserted and old fixtures deactivated; no stock/history is deleted.
insert into public.categories (name, slug) values
  ('Poultry', 'poultry'),
  ('Beef & Goat', 'beef-goat'),
  ('Pork', 'pork'),
  ('Fish', 'fish'),
  ('Seafood', 'seafood'),
  ('Frozen Staples', 'frozen-staples')
on conflict (slug) do update set name = excluded.name, is_active = true;

update public.products
set is_active = false, updated_at = now()
where sku like 'DEV-%';

insert into public.products (
  category_id, sku, name, description, selling_price, cost_price,
  reorder_level, image_path, is_active
)
select category.id, fixture.sku, fixture.name, fixture.description,
  fixture.selling_price, null, 0, fixture.image_path, true
from (values
  ('poultry', 'GP-CHK-WHOLE', 'Whole Frozen Chicken', 'Whole frozen chicken, approximately 1.3 kg each. A convenient centrepiece for roasting, grilling, or family meals.', 55.00::numeric, '/products/whole-frozen-chicken.webp'),
  ('poultry', 'GP-CHK-BREAST', 'Chicken Breast Fillets', 'Boneless, skinless frozen chicken breast fillets in a 1 kg pack. Lean and versatile for stir-fries, grills, and everyday cooking.', 58.00::numeric, '/products/chicken-breast-fillets.webp'),
  ('poultry', 'GP-CHK-WINGS', 'Chicken Wings', 'Frozen chicken wings in a 1 kg pack, ready for oven baking, grilling, or frying.', 52.00::numeric, '/products/chicken-wings.webp'),
  ('poultry', 'GP-CHK-DRUM', 'Chicken Drumsticks', 'Frozen chicken drumsticks in a 1 kg pack. Well suited to marinades, grills, and family dinners.', 40.00::numeric, '/products/chicken-drumsticks.webp'),
  ('poultry', 'GP-CHK-THIGH', 'Chicken Thighs', 'Frozen bone-in chicken thighs in a 1 kg pack, with rich flavour for stews, roasts, and grills.', 42.00::numeric, '/products/chicken-thighs.webp'),
  ('poultry', 'GP-TUR-WING', 'Turkey Wings', 'Frozen turkey wings in a 1 kg pack. A hearty option for soups, stews, and oven roasting.', 68.00::numeric, '/products/turkey-wings.webp'),
  ('poultry', 'GP-CHK-GIZZ', 'Chicken Gizzards', 'Cleaned frozen chicken gizzards in a 1 kg pack, popular for peppered dishes, stews, and grills.', 45.00::numeric, '/products/chicken-gizzards.webp'),
  ('beef-goat', 'GP-BEEF-STEW', 'Beef Stew Cubes', 'Frozen bone-in beef pieces in a 1 kg pack, cut for Ghanaian soups and slow-cooked stews.', 85.00::numeric, '/products/beef-stew-cubes.webp'),
  ('beef-goat', 'GP-BEEF-MINCE', 'Minced Beef', 'Frozen minced beef in a 1 kg pack. Easy to portion for sauces, kebabs, pies, and meatballs.', 65.00::numeric, '/products/minced-beef.webp'),
  ('beef-goat', 'GP-GOAT-ASSORT', 'Goat Meat, Assorted', 'Assorted frozen goat meat in a 1 kg pack, suitable for light soup, stew, and festive cooking.', 110.00::numeric, '/products/goat-meat-assorted.webp'),
  ('pork', 'GP-PORK-RIBS', 'Pork Ribs', 'Frozen pork ribs in a 1 kg pack, ready for slow cooking, oven roasting, or grilling.', 85.00::numeric, '/products/pork-ribs.webp'),
  ('pork', 'GP-PORK-SAUS', 'Pork Sausages', 'Frozen pork sausages in a 1 kg pack. Convenient for breakfast, grills, and quick meals.', 85.00::numeric, '/products/beef-sausages.webp'),
  ('fish', 'GP-FISH-TILAPIA', 'Whole Tilapia', 'Whole frozen tilapia in an approximately 1 kg pack, a Ghanaian favourite for grilling, frying, or soup.', 78.00::numeric, '/products/whole-tilapia.webp'),
  ('fish', 'GP-FISH-MACK', 'Mackerel (Kpanla)', 'Frozen mackerel, also known locally as kpanla, in a 1 kg pack. Great for stews, grilling, and sauces.', 50.00::numeric, '/products/mackerel-kpanla.webp'),
  ('fish', 'GP-FISH-SNAPPER', 'Red Snapper', 'Whole frozen red snapper in an approximately 1 kg pack, with firm flesh for grilling, frying, and soups.', 66.00::numeric, '/products/red-snapper.webp'),
  ('fish', 'GP-FISH-HAKE', 'Hake Fillets', 'Frozen hake fillets in a 1 kg pack. Mild, flaky white fish for pan-frying, baking, or stews.', 42.00::numeric, '/products/hake-fillets.webp'),
  ('fish', 'GP-FISH-TUNA', 'Tuna Steaks', 'Frozen tuna steaks in a 500 g pack, portioned for quick pan-searing or grilling.', 55.00::numeric, '/products/tuna-steaks.webp'),
  ('fish', 'GP-FISH-SMOKED-TILA', 'Smoked Tilapia', 'Smoked tilapia, medium size. A flavourful addition to soups, sauces, and traditional dishes.', 25.00::numeric, '/products/smoked-tilapia.webp'),
  ('fish', 'GP-FISH-HERRING', 'Dried Herrings', 'Dried herrings in a 500 g pack, a pantry-friendly ingredient for soups and sauces.', 35.00::numeric, '/products/dried-herrings.webp'),
  ('seafood', 'GP-SEA-SHRIMP', 'Shrimp', 'Frozen peeled shrimp in a 1 kg pack, convenient for jollof, fried rice, pasta, and sauces.', 150.00::numeric, '/products/shrimp.webp'),
  ('seafood', 'GP-SEA-PRAWNS', 'King Prawns', 'Frozen king prawns in a 500 g pack, suitable for grills, stir-fries, and special meals.', 50.00::numeric, '/products/king-prawns.webp'),
  ('seafood', 'GP-SEA-CRAB', 'Mud Crabs', 'Frozen mud crabs in a four-piece pack. Add to seafood stews, soups, or a shared platter.', 45.00::numeric, '/products/mud-crabs.webp'),
  ('seafood', 'GP-SEA-LOBSTER', 'Lobster Tails', 'Frozen lobster tails in a 500 g pack, a premium choice for grilling or a special dinner.', 140.00::numeric, '/products/lobster-tails.webp'),
  ('seafood', 'GP-SEA-SQUID', 'Squid Rings', 'Frozen squid rings in a 500 g pack, ready for light frying, grilling, or seafood pasta.', 65.00::numeric, '/products/squid-rings.webp'),
  ('seafood', 'GP-SEA-OCTOPUS', 'Octopus Pieces', 'Frozen octopus pieces in a 500 g pack, ideal for stews, soups, or a seafood platter.', 75.00::numeric, '/products/octopus-pieces.webp'),
  ('beef-goat', 'GP-BEEF-TRIPE', 'Cow Tripe (Kpakpo)', 'Cleaned frozen cow tripe in a 1 kg pack, a traditional addition to soups and stews.', 50.00::numeric, '/products/cow-tripe-kpakpo.webp'),
  ('beef-goat', 'GP-BEEF-LIVER', 'Beef Liver', 'Frozen beef liver in a 1 kg pack, suitable for quick frying, stews, and mixed grills.', 45.00::numeric, '/products/beef-liver.webp'),
  ('frozen-staples', 'GP-FROZEN-FRIES', 'Frozen French Fries', 'Frozen ready-to-cook French fries in a 1 kg pack. Bake or fry until crisp.', 35.00::numeric, '/products/frozen-french-fries.webp'),
  ('frozen-staples', 'GP-FROZEN-MIX-VEG', 'Frozen Mixed Vegetables', 'Frozen mixed vegetables in a 1 kg pack, a convenient addition to rice, noodles, and stews.', 30.00::numeric, '/products/frozen-mixed-vegetables.webp'),
  ('frozen-staples', 'GP-FROZEN-PEAS', 'Frozen Green Peas', 'Frozen green peas in a 1 kg pack, ready to add to soups, rice, and family meals.', 30.00::numeric, '/products/frozen-green-peas.webp')
) as fixture(category_slug, sku, name, description, selling_price, image_path)
join public.categories as category on category.slug = fixture.category_slug
on conflict (lower(sku)) where sku is not null do update set
  category_id = excluded.category_id,
  name = excluded.name,
  description = excluded.description,
  selling_price = excluded.selling_price,
  image_path = excluded.image_path,
  is_active = true,
  updated_at = now();
