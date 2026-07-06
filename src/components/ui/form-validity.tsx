"use client";

import { useEffect, useRef } from "react";

// Replaces the browser's default validation bubble text (e.g. "Please fill out
// this field.") with our own copy, on whichever <form> it's dropped inside.
// Only overrides the empty-required message; format hints (bad email, etc.) keep
// the browser's more specific guidance. Clears on input so it never gets stale.
const REQUIRED_MESSAGE = "Please complete this field.";

export function FormValidityMessages() {
  const anchorRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const form = anchorRef.current?.closest("form");
    if (!form) return;

    const fields = Array.from(
      form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input, select, textarea"),
    );

    const onInvalid = (event: Event) => {
      const el = event.target as HTMLInputElement;
      if (el.validity.valueMissing) el.setCustomValidity(REQUIRED_MESSAGE);
    };
    const onInput = (event: Event) => {
      (event.target as HTMLInputElement).setCustomValidity("");
    };

    for (const field of fields) {
      field.addEventListener("invalid", onInvalid);
      field.addEventListener("input", onInput);
      field.addEventListener("change", onInput);
    }

    return () => {
      for (const field of fields) {
        field.removeEventListener("invalid", onInvalid);
        field.removeEventListener("input", onInput);
        field.removeEventListener("change", onInput);
      }
    };
  }, []);

  return <span ref={anchorRef} className="hidden" aria-hidden />;
}
