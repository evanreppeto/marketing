"use client";

import { Eye, EyeOff, LockKeyhole } from "lucide-react";
import { useState, type KeyboardEvent } from "react";

import { AUTH_FIELD_INPUT, AUTH_FIELD_SHELL } from "./auth-field";

/**
 * Shared password input for the auth screens: show/hide toggle plus a Caps-Lock
 * warning (a common cause of "my password is wrong" support tickets). Renders just
 * the field shell + warning; the caller supplies the surrounding <label> and its text.
 */
export function PasswordField({
  name,
  placeholder = "Enter password",
  autoComplete = "current-password",
  autoFocus = false,
  minLength,
  required = true,
}: {
  name: string;
  placeholder?: string;
  autoComplete?: string;
  autoFocus?: boolean;
  minLength?: number;
  required?: boolean;
}) {
  const [show, setShow] = useState(false);
  const [capsOn, setCapsOn] = useState(false);

  const trackCaps = (event: KeyboardEvent<HTMLInputElement>) => {
    if (typeof event.getModifierState === "function") {
      setCapsOn(event.getModifierState("CapsLock"));
    }
  };

  return (
    <>
      <span className={AUTH_FIELD_SHELL}>
        <LockKeyhole aria-hidden="true" className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
        <input
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          className={AUTH_FIELD_INPUT}
          minLength={minLength}
          name={name}
          onBlur={() => setCapsOn(false)}
          onKeyDown={trackCaps}
          onKeyUp={trackCaps}
          placeholder={placeholder}
          required={required}
          type={show ? "text" : "password"}
        />
        <button
          aria-label={show ? "Hide password" : "Show password"}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-[var(--text-muted)] outline-none transition hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--accent-soft)]"
          onClick={() => setShow((value) => !value)}
          type="button"
        >
          {show ? <EyeOff aria-hidden="true" className="h-4 w-4" /> : <Eye aria-hidden="true" className="h-4 w-4" />}
        </button>
      </span>
      {capsOn ? (
        <p aria-live="polite" className="mt-1.5 text-xs font-medium text-[var(--warn-text)]">
          Caps Lock is on.
        </p>
      ) : null}
    </>
  );
}
