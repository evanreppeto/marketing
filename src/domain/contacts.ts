import { z } from "zod";

import { INTERNAL_UNASSIGNED_PERSONA, OFFICIAL_PERSONA_MAPPINGS } from "./personas";

const PERSONA_VALUES = [...OFFICIAL_PERSONA_MAPPINGS, INTERNAL_UNASSIGNED_PERSONA] as [string, ...string[]];

export const CONTACT_STATUSES = ["active", "inactive", "do_not_contact", "archived"] as const;
export const ContactStatusSchema = z.enum(CONTACT_STATUSES);
export type ContactStatus = z.infer<typeof ContactStatusSchema>;

export const ContactRowSchema = z.object({
  id: z.string().uuid(),
  company_id: z.string().uuid().nullable(),
  persona: z.enum(PERSONA_VALUES),
  status: ContactStatusSchema,
  first_name: z.string().nullable(),
  last_name: z.string().nullable(),
  full_name: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  title: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
});

export const ContactSchema = ContactRowSchema.transform((row) => ({
  id: row.id,
  companyId: row.company_id,
  persona: row.persona,
  status: row.status,
  firstName: row.first_name,
  lastName: row.last_name,
  fullName: row.full_name,
  email: row.email,
  phone: row.phone,
  title: row.title,
  metadata: row.metadata,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
}));

export type ContactRow = z.infer<typeof ContactRowSchema>;
export type Contact = z.infer<typeof ContactSchema>;
