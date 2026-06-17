export const OPERATOR_COOKIE = "signal_operator";
export const DEFAULT_OPERATOR_RETURN_PATH = "/";

export function getConfiguredOperatorToken() {
  const token = process.env.OPERATOR_ACCESS_TOKEN;
  return token && token.length > 0 ? token : undefined;
}

export function getConfiguredOperatorCredentials() {
  const email = process.env.OPERATOR_EMAIL?.trim().toLowerCase();
  const password = process.env.OPERATOR_PASSWORD;

  if (!email || !password) {
    return undefined;
  }

  return { email, password };
}

export function isOperatorGateEnabled() {
  return Boolean(getConfiguredOperatorToken());
}

export function isValidOperatorValue(value: string | undefined) {
  const token = getConfiguredOperatorToken();
  return Boolean(token) && value === token;
}

export function isValidOperatorCredentials(email: string | undefined, password: string | undefined) {
  const credentials = getConfiguredOperatorCredentials();

  if (!credentials) {
    return false;
  }

  return email?.trim().toLowerCase() === credentials.email && password === credentials.password;
}

export function getSafeOperatorReturnPath(value: string | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return DEFAULT_OPERATOR_RETURN_PATH;
  }

  let parsed: URL;
  try {
    parsed = new URL(value, "https://operator.local");
  } catch {
    return DEFAULT_OPERATOR_RETURN_PATH;
  }

  if (parsed.origin !== "https://operator.local") {
    return DEFAULT_OPERATOR_RETURN_PATH;
  }

  if (parsed.pathname === "/login" || parsed.pathname === "/sign-in" || parsed.pathname === "/sign-up") {
    return DEFAULT_OPERATOR_RETURN_PATH;
  }

  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}
