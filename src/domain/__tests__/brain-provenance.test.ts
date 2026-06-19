import { describe, expect, it } from "vitest";

import { nodeProvenance, type ProvenanceInput } from "../brain-provenance";

const base: ProvenanceInput = {
  kind: "proof_point",
  source: null,
  createdBy: null,
  refTable: null,
  refId: null,
  tags: [],
};

describe("nodeProvenance", () => {
  it("maps a CRM lead reference to the crm system with a record deep-link", () => {
    const p = nodeProvenance({ ...base, refTable: "leads", refId: "lead-1" });
    expect(p.system).toBe("crm");
    expect(p.label).toBe("CRM · Lead");
    expect(p.deepLink).toEqual({ href: "/crm/leads/lead-1", label: "Open CRM record" });
  });

  it("maps each CRM table", () => {
    for (const [t, id] of [["companies", "c1"], ["contacts", "k1"], ["properties", "p1"], ["jobs", "j1"], ["outcomes", "o1"]] as const) {
      expect(nodeProvenance({ ...base, refTable: t, refId: id }).system).toBe("crm");
      expect(nodeProvenance({ ...base, refTable: t, refId: id }).deepLink?.href).toBe(`/crm/${t}/${id}`);
    }
  });

  it("maps a campaign reference", () => {
    const p = nodeProvenance({ ...base, refTable: "campaigns", refId: "camp-9" });
    expect(p.system).toBe("campaign");
    expect(p.deepLink).toEqual({ href: "/campaigns/camp-9", label: "Open campaign" });
  });

  it("maps a media asset to the library with an asset query deep-link", () => {
    const p = nodeProvenance({ ...base, refTable: "media_assets", refId: "asset-7" });
    expect(p.system).toBe("library");
    expect(p.label).toBe("Library asset");
    expect(p.deepLink).toEqual({ href: "/library?asset=asset-7", label: "Open in Library" });
  });

  it("labels a brand-tagged media asset as a Brand asset but still links to the library", () => {
    const p = nodeProvenance({ ...base, refTable: "media_assets", refId: "asset-7", tags: ["brand-source", "proof"] });
    expect(p.system).toBe("brand");
    expect(p.label).toBe("Brand asset");
    expect(p.deepLink?.href).toBe("/library?asset=asset-7");
  });

  it("treats an unlinked arc-created node as arc inference with no deep-link", () => {
    const p = nodeProvenance({ ...base, createdBy: "arc" });
    expect(p.system).toBe("arc");
    expect(p.label).toBe("Arc inference");
    expect(p.deepLink).toBeNull();
    expect(p.learnedBy).toBe("arc");
  });

  it("treats an unlinked human-created node as human", () => {
    const p = nodeProvenance({ ...base, createdBy: "operator" });
    expect(p.system).toBe("human");
    expect(p.learnedBy).toBe("human");
    expect(p.deepLink).toBeNull();
  });

  it("flags brand-sync provenance from the ingestion source", () => {
    const p = nodeProvenance({ ...base, refTable: "media_assets", refId: "a1", source: "brand_source_ingestion" });
    expect(p.learnedBy).toBe("brand_sync");
  });
});
