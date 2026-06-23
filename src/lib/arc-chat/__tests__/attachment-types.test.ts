import { describe, expect, it } from "vitest";
import { ACCEPTED_ATTACHMENT_MIME, isAcceptedAttachment, attachmentKind } from "../attachment-types";

describe("attachment-types", () => {
  it("accepts images, pdf, and the text types", () => {
    expect(isAcceptedAttachment("image/png")).toBe(true);
    expect(isAcceptedAttachment("application/pdf")).toBe(true);
    expect(isAcceptedAttachment("text/markdown")).toBe(true);
  });
  it("rejects docx, video, and empty", () => {
    expect(isAcceptedAttachment("application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe(false);
    expect(isAcceptedAttachment("video/mp4")).toBe(false);
    expect(isAcceptedAttachment("")).toBe(false);
  });
  it("classifies kind for rendering + model mapping", () => {
    expect(attachmentKind("image/jpeg")).toBe("image");
    expect(attachmentKind("application/pdf")).toBe("pdf");
    expect(attachmentKind("text/csv")).toBe("text");
    expect(attachmentKind("video/mp4")).toBe("other");
  });
  it("exposes a comma-joined accept string including image and pdf", () => {
    expect(ACCEPTED_ATTACHMENT_MIME).toContain("image/png");
    expect(ACCEPTED_ATTACHMENT_MIME).toContain("application/pdf");
  });
});
