import { describe, expect, it } from "vitest";

import { isPrivateAddress } from "../fetch-public-page";

describe("isPrivateAddress", () => {
  it("rejects loopback, private, link-local, and metadata IPv4", () => {
    for (const ip of ["127.0.0.1", "10.0.0.5", "192.168.1.1", "172.16.0.1", "169.254.169.254", "0.0.0.0"]) {
      expect(isPrivateAddress(ip, 4)).toBe(true);
    }
  });
  it("rejects IPv6 loopback + unique/link-local", () => {
    expect(isPrivateAddress("::1", 6)).toBe(true);
    expect(isPrivateAddress("fe80::1", 6)).toBe(true);
    expect(isPrivateAddress("fd00::1", 6)).toBe(true);
  });
  it("allows public addresses", () => {
    expect(isPrivateAddress("8.8.8.8", 4)).toBe(false);
    expect(isPrivateAddress("172.32.0.1", 4)).toBe(false);
    expect(isPrivateAddress("2606:4700::1111", 6)).toBe(false);
  });
});
