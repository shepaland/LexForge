import { z } from "zod";

/** kebab-case: lowercase letters and digits, single dashes between them. */
export const KEBAB_CASE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const ArtifactDefinitionSchema = z.object({
  id: z.string().regex(KEBAB_CASE),
  description: z.string().min(1),
  template: z.string().min(1),
  generates: z.string().min(1),
  requires: z.array(z.string()).default([]),
  instruction: z.string().min(1),
});

export const SchemaDefinitionSchema = z.object({
  name: z.string().regex(KEBAB_CASE),
  description: z.string().min(1),
  artifacts: z.array(ArtifactDefinitionSchema).min(1),
});

export type ArtifactDefinition = z.infer<typeof ArtifactDefinitionSchema>;
export type SchemaDefinition = z.infer<typeof SchemaDefinitionSchema>;
