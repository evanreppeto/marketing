import type { ReactElement } from "react";

import type { BrandTokens, CreativeCopy, CreativeDimensions } from "@/domain";

export type CreativeTemplateProps = {
  brand: BrandTokens;
  copy: CreativeCopy;
  dims: CreativeDimensions;
  /** Background image as a data: URL (fetched + inlined by the renderer). */
  backgroundDataUrl: string;
  /** Logo as a data: URL, or null when the brand has no logo (use the short mark). */
  logoDataUrl: string | null;
};

export type CreativeTemplate = (p: CreativeTemplateProps) => ReactElement;
