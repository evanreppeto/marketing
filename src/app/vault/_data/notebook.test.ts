import { describe, expect, it } from "vitest";

import { collectionThemes, vaultCollections } from "./notebook";

describe("collectionThemes", () => {
  it("has a theme for every vault collection", () => {
    for (const collection of vaultCollections) {
      expect(collectionThemes[collection.folder]).toBeDefined();
    }
  });
});
