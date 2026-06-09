import { describe, expect, it } from "vitest";

import { AppController } from "../src/app.controller";

describe("AppController", () => {
  it("reports a healthy API", () => {
    expect(new AppController().getHealth()).toEqual({
      name: "api",
      status: "ok"
    });
  });
});
