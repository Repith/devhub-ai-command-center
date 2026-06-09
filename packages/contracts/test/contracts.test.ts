import { describe, expect, it } from "vitest";

import { API_PREFIX } from "../src";

describe("contracts", () => {
  it("uses the versioned API prefix", () => {
    expect(API_PREFIX).toBe("/api/v1");
  });
});
