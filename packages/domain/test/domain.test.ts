import { describe, expect, it } from "vitest";

import { formatServiceName } from "../src";

describe("domain foundation", () => {
  it("formats service names consistently", () => {
    expect(formatServiceName("Worker")).toBe("DevHub AI Command Center Worker");
  });
});
