// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ChatMarkdown } from "../components/chat-markdown";

afterEach(cleanup);

describe("ChatMarkdown", () => {
  it("renders markdown text and code blocks", () => {
    render(
      <ChatMarkdown
        content={[
          "Here is **code**:",
          "",
          "```ts",
          "const answer = 42;",
          "```"
        ].join("\n")}
      />
    );

    expect(screen.getByText("code")).toBeVisible();
    expect(screen.getByText("const answer = 42;")).toBeVisible();
  });
});
