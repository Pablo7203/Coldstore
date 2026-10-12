-- pgTAP is a development verification dependency, not an application feature.
-- Keep it in the migration history so hosted RLS tests are reproducible.
create extension if not exists pgtap with schema extensions;
