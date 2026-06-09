import { describe, expect, it } from "vitest";

import { getWorkerName } from "../src";

describe("worker foundation", () => {
  it("exposes a stable service name", () => {
    expect(getWorkerName()).toBe("DevHub AI Command Center Worker");
  });
});
