import { describe, expect, it } from "vitest";

import {
  channelPreviewKind,
  editableFieldSpec,
  isDraftEdited,
  resolveDraftFields,
} from "../mark-canvas";

describe("channelPreviewKind", () => {
  it("classifies email channels", () => {
    expect(channelPreviewKind("Email", null)).toBe("email");
    expect(channelPreviewKind("newsletter", null)).toBe("email");
    expect(channelPreviewKind(null, "email_blast")).toBe("email");
  });
  it("classifies ad channels", () => {
    expect(channelPreviewKind("Meta Ad", null)).toBe("ad");
    expect(channelPreviewKind("facebook", null)).toBe("ad");
    expect(channelPreviewKind("instagram", null)).toBe("ad");
    expect(channelPreviewKind(null, "paid_social")).toBe("ad");
  });
  it("classifies sms channels", () => {
    expect(channelPreviewKind("SMS", null)).toBe("sms");
    expect(channelPreviewKind("text message", null)).toBe("sms");
  });
  it("falls back to generic", () => {
    expect(channelPreviewKind(null, null)).toBe("generic");
    expect(channelPreviewKind("billboard", "physical")).toBe("generic");
  });
  it("does not false-positive 'ad' inside words like broadcast", () => {
    expect(channelPreviewKind("broadcast", null)).toBe("generic");
  });
});

describe("editableFieldSpec", () => {
  it("email exposes subject + body", () => {
    expect(editableFieldSpec("email").map((f) => f.key)).toEqual(["subject", "body"]);
  });
  it("ad exposes primaryText + headline + cta", () => {
    expect(editableFieldSpec("ad").map((f) => f.key)).toEqual(["primaryText", "headline", "cta"]);
  });
  it("sms exposes body only", () => {
    expect(editableFieldSpec("sms").map((f) => f.key)).toEqual(["body"]);
  });
  it("generic exposes title + body", () => {
    expect(editableFieldSpec("generic").map((f) => f.key)).toEqual(["title", "body"]);
  });
});

describe("resolveDraftFields", () => {
  it("prefers edited over prompt_inputs over draft", () => {
    const fields = resolveDraftFields({
      title: "T",
      draftBody: "draft body",
      editedBody: "edited body",
      promptInputs: { subject: "PI subject", headline: "PI headline" },
      editedFields: { subject: "Edited subject" },
    });
    expect(fields.body).toBe("edited body");
    expect(fields.subject).toBe("Edited subject");
    expect(fields.headline).toBe("PI headline");
  });
  it("falls back to draft body when no edited body", () => {
    const fields = resolveDraftFields({
      title: null,
      draftBody: "draft body",
      editedBody: null,
      promptInputs: {},
      editedFields: {},
    });
    expect(fields.body).toBe("draft body");
  });
  it("reads cta synonyms from prompt_inputs", () => {
    const fields = resolveDraftFields({
      title: null,
      draftBody: "",
      editedBody: null,
      promptInputs: { call_to_action: "Book now" },
      editedFields: {},
    });
    expect(fields.cta).toBe("Book now");
  });
  it("returns empty-string body when nothing present", () => {
    const fields = resolveDraftFields({
      title: null,
      draftBody: null,
      editedBody: null,
      promptInputs: {},
      editedFields: {},
    });
    expect(fields.body).toBe("");
  });
});

describe("isDraftEdited", () => {
  it("true when edited_body present", () => {
    expect(isDraftEdited({ editedBody: "x", editedFields: {} })).toBe(true);
  });
  it("true when edited_fields non-empty", () => {
    expect(isDraftEdited({ editedBody: null, editedFields: { subject: "x" } })).toBe(true);
  });
  it("false when neither", () => {
    expect(isDraftEdited({ editedBody: null, editedFields: {} })).toBe(false);
    expect(isDraftEdited({ editedBody: "", editedFields: {} })).toBe(false);
  });
});
