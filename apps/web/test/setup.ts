import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// RTL's built-in auto-cleanup only self-registers when it can see a global `afterEach` (i.e.
// with vitest's `test.globals: true`). This project imports test hooks explicitly instead, so
// register cleanup here explicitly to avoid DOM from one test leaking into the next within the
// same file (e.g. multiple `render()` calls in one describe block).
afterEach(() => {
  cleanup();
});
