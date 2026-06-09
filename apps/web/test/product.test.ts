import { describe, expect, it } from "vitest";

import { PRODUCT_NAME } from "../lib/product";

describe("product foundation", () => {
  it("exports the portfolio product name", () => {
    expect(PRODUCT_NAME).toBe("DevHub AI Command Center");
  });
});
