import { describe, expect, it } from "vitest";

import { classifyLossSignals } from "../loss-classification";

describe("loss classification", () => {
  it("elevates flood and water-related losses", () => {
    expect(classifyLossSignals(["Basement flooding after storm"])).toMatchObject({
      classification: "target_water_loss",
      routingRecommendation: "elevate",
      matchedTargetKeywords: ["flooding"],
    });
  });

  it("elevates standing water, water backup, storm surge, and burst pipe signals", () => {
    const result = classifyLossSignals([
      "Standing water in unit",
      "possible water backup",
      "storm surge nearby",
      "burst pipe in basement",
    ]);

    expect(result).toMatchObject({
      classification: "target_water_loss",
      routingRecommendation: "elevate",
      matchedTargetKeywords: [
        "standing water",
        "water backup",
        "storm surge",
        "burst pipe",
      ],
    });
  });

  it("archives hail-only losses with no interior water signal", () => {
    expect(classifyLossSignals("car hail damage")).toMatchObject({
      classification: "non_target_hail_or_wind_only",
      routingRecommendation: "archive_low_priority",
      matchedNonTargetKeywords: ["hail", "hail damage"],
    });
  });

  it("archives wind-only roof losses with no interior water signal", () => {
    expect(classifyLossSignals("Wind-only roof loss, no interior leak")).toMatchObject({
      classification: "non_target_hail_or_wind_only",
      routingRecommendation: "archive_low_priority",
      matchedNonTargetKeywords: ["wind-only roof loss"],
    });
  });

  it("prioritizes target water signals when non-target terms are also present", () => {
    expect(classifyLossSignals("hail damage plus standing water inside")).toMatchObject({
      classification: "target_water_loss",
      routingRecommendation: "elevate",
      matchedTargetKeywords: ["standing water"],
      matchedNonTargetKeywords: ["hail", "hail damage"],
    });
  });

  it("routes unknown losses to standard review", () => {
    expect(classifyLossSignals("general property inspection")).toMatchObject({
      classification: "unknown",
      routingRecommendation: "standard_review",
      matchedTargetKeywords: [],
      matchedNonTargetKeywords: [],
    });
  });
});
