import { render, screen } from "@testing-library/react";
import { MarkdownMessage } from "../src/components/MarkdownMessage.js";
import { describe, it, expect } from "vitest";

describe("MarkdownMessage", () => {
  it("renders markdown table correctly", () => {
    const markdown = `
| Name | Skills | Experience |
|------|--------|------------|
| Alice | Go, Python | 5 years |
| Bob | Go, Rust | 3 years |
    `.trim();

    render(<MarkdownMessage content={markdown} />);

    // Check if table elements are rendered
    const table = screen.getByRole("table");
    expect(table).toBeInTheDocument();

    // Check if headers are rendered
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Skills")).toBeInTheDocument();
    expect(screen.getByText("Experience")).toBeInTheDocument();

    // Check if data is rendered
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("renders regular markdown formatting", () => {
    const markdown = "**Bold text** and *italic text*";
    render(<MarkdownMessage content={markdown} />);

    expect(screen.getByText("Bold text")).toBeInTheDocument();
    expect(screen.getByText("italic text")).toBeInTheDocument();
  });
});
