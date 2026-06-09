import { describe, expect, it } from "vitest";

import {
  assertAgentRunTransition,
  assertDocumentTransition,
  formatServiceName,
  InvalidStatusTransitionError
} from "../src";

describe("domain foundation", () => {
  it("formats service names consistently", () => {
    expect(formatServiceName("Worker")).toBe("DevHub AI Command Center Worker");
  });

  it("allows documented status transitions", () => {
    expect(() =>
      assertDocumentTransition("UPLOADED", "PROCESSING")
    ).not.toThrow();
    expect(() =>
      assertAgentRunTransition("RUNNING", "COMPLETED")
    ).not.toThrow();
  });

  it("prevents terminal states from becoming active again", () => {
    expect(() => assertAgentRunTransition("COMPLETED", "RUNNING")).toThrow(
      InvalidStatusTransitionError
    );
  });
});
