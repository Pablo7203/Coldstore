import "server-only";

type SafeOutcome = "ok" | "error" | "staff" | "customer" | "inactive" | "unknown";

export function phase2Diagnostic(
  stage: string,
  startedAt?: number,
  outcome?: SafeOutcome,
  itemCount?: number,
) {
  if (process.env.PHASE2_DIAGNOSTICS !== "1") return;
  const duration =
    startedAt === undefined ? undefined : Math.round(performance.now() - startedAt);
  const fields = [
    `stage=${stage}`,
    duration === undefined ? undefined : `elapsed_ms=${duration}`,
    outcome === undefined ? undefined : `outcome=${outcome}`,
    itemCount === undefined ? undefined : `item_count=${itemCount}`,
  ].filter(Boolean);
  console.info(`[phase2-diagnostic] ${fields.join(" ")}`);
}
