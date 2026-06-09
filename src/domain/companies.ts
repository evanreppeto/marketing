import { z } from "zod";

import { INTERNAL_UNASSIGNED_PERSONA, OFFICIAL_PERSONA_MAPPINGS } from "./personas";

const PERSONA_VALUES = [...OFFICIAL_PERSONA_MAPPINGS, INTERNAL_UNASSIGNED_PERSONA] as [string, ...string[]];

export const COMPANY_STATUSES = ["active", "inactive", "archived"] as const;
export const CompanyStatusSchema = z.enum(COMPANY_STATUSES);
export type CompanyStatus = z.infer<typeof CompanyStatusSchema>;

export const CompanyRowSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  persona: z.enum(PERSONA_VALUES),
  status: CompanyStatusSchema,
  website_url: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  partner_tier: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
});

export const CompanySchema = CompanyRowSchema.transform((row) => ({
  id: row.id,
  name: row.name,
  persona: row.persona,
  status: row.status,
  websiteUrl: row.website_url,
  phone: row.phone,
  email: row.email,
  partnerTier: row.partner_tier,
  metadata: row.metadata,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
}));

export type CompanyRow = z.infer<typeof CompanyRowSchema>;
export type Company = z.infer<typeof CompanySchema>;
