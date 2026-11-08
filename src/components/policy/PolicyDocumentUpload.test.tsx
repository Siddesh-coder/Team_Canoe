import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PolicyDocumentUpload } from "./PolicyDocumentUpload";
import { policyDocumentApi } from "@/lib/policy/documents";
import type { Draft } from "@/lib/policy/types";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const draft: Draft = { title: "Engine policy", rules: [{ id: "backend-id", outcome: "human_review", reason: "Quote", when: [{ field: "quote_eur", op: "gt", value: 1200 }], blank_counts_as_match: false }], default: { id: "default", outcome: "routine_processing", reason: "Otherwise" } };
const parsed = { mode: "replace" as const, lines: [], warnings: [], notes: [], has_errors: false, draft };

it("automatically loads the backend draft into the existing owner state on file selection", async () => {
  const parse = vi.spyOn(policyDocumentApi, "parse").mockResolvedValue(parsed);
  const onDraft = vi.fn(); render(<PolicyDocumentUpload onDraft={onDraft} />);
  const file = new File(["rule"], "policy.txt");
  fireEvent.change(screen.getByLabelText("Policy document"), { target: { files: [file] } });
  await waitFor(() => expect(onDraft).toHaveBeenCalledWith(draft));
  expect(onDraft.mock.calls[0]?.[0]).toBe(draft);
  expect(parse).toHaveBeenCalledWith(file, "replace");
});

it("sends add mode without merging or changing the returned rules locally", async () => {
  const parse = vi.spyOn(policyDocumentApi, "parse").mockResolvedValue({ ...parsed, mode: "add" });
  const onDraft = vi.fn(); render(<PolicyDocumentUpload onDraft={onDraft} />);
  fireEvent.click(screen.getByRole("radio", { name: "Add these rules to the current ones" }));
  const file = new File(["rule"], "policy.md");
  fireEvent.change(screen.getByLabelText("Policy document"), { target: { files: [file] } });
  await waitFor(() => expect(onDraft).toHaveBeenCalledWith(draft));
  expect(parse).toHaveBeenCalledWith(file, "add");
});

it("never updates the existing draft when any line failed parsing", async () => {
  vi.spyOn(policyDocumentApi, "parse").mockResolvedValue({ ...parsed, has_errors: true, draft: null, lines: [{ n: 2, text: "Unreadable", status: "error", detail: "Unknown field" }] });
  const onDraft = vi.fn(); render(<PolicyDocumentUpload onDraft={onDraft} />);
  fireEvent.change(screen.getByLabelText("Policy document"), { target: { files: [new File(["bad"], "policy.txt")] } });
  await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
  expect(onDraft).not.toHaveBeenCalled();
});