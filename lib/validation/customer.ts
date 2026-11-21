import { z } from "zod";
import { normalizeGhanaPhone } from "@/lib/validation/ghana-phone";

export const customerInputSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .transform((value, context) => {
      const normalized = normalizeGhanaPhone(value);
      if (!normalized) {
        context.addIssue({
          code: "custom",
          message: "Enter a valid Ghana phone number.",
        });
        return z.NEVER;
      }
      return normalized;
    }),
  email: z.union([z.string().trim().email().max(254), z.literal("")]).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export const customerUpdateSchema = customerInputSchema.extend({
  status: z.enum(["active", "inactive"]),
});

export const customerSearchSchema = z.string().trim().max(100);

export type CustomerInput = z.infer<typeof customerInputSchema>;
