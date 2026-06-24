// Vitest mock for the `server-only` package.
// The real package throws at import time when used in a non-server context.
// In tests we simply no-op it so server modules can be exercised directly.
export {};
