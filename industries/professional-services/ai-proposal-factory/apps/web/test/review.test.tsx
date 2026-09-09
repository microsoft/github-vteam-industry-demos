import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { proposalSectionKeys, proposalSectionTitles, type Proposal } from "@proposal-factory/contracts";
import { App } from "../src/App.js";

function proposal(approved = false): Proposal {
  return {
    id: "proposal-1", opportunityId: "opp-01", title: "Reviewed proposal", status: "In Review",
    reviewVersion: "review-a", risks: [], citations: [],
    createdAt: "2026-09-07T14:00:00Z", updatedAt: "2026-09-07T14:00:00Z",
    sections: proposalSectionKeys.map((key) => ({
      key, title: proposalSectionTitles[key], required: true, currentRevisionId: `${key}-a`,
      ...(approved ? { approvedRevisionId: `${key}-a` } : {}),
      revisions: [{ id: `${key}-a`, revision: 1, content: `Displayed ${key} A`, source: "Generated",
        citationIds: [], createdAt: "2026-09-07T14:00:00Z" }]
    }))
  };
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("exact reviewed revision browser contract", () => {
  it.each([409, 412])("sends displayed section ID and requires explicit refresh after %s", async (status) => {
    const seen = proposal();
    const updated = structuredClone(seen);
    updated.reviewVersion = "review-b";
    const section = updated.sections[0]!;
    section.currentRevisionId = "executive-summary-b";
    section.revisions.push({ ...section.revisions[0]!, id: section.currentRevisionId, content: "Changed content B", revision: 2 });
    let reads = 0;
    let approvals = 0;
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, options) => {
      if (String(url).includes("/api/session")) {
        return Response.json({
          mode: "development", id: "local-user", tenantId: "local-tenant",
          displayName: "Local Development Member", roles: ["ProposalFactory.WorkspaceMember"]
        });
      }
      if (options?.method === "POST") {
        const expected = JSON.parse(options.body as string).expectedRevisionId;
        expect(expected).toBe(approvals++ === 0 ? "executive-summary-a" : "executive-summary-b");
        if (approvals === 1) return Response.json({
          error: "STALE_REVIEW", message: "The section changed since review."
        }, { status });
        return Response.json({ ...updated, sections: updated.sections.map((item, index) =>
          index === 0 ? { ...item, approvedRevisionId: item.currentRevisionId } : item) });
      }
      return Response.json(reads++ === 0 ? seen : updated);
    });
    render(<MemoryRouter initialEntries={["/opportunities/opp-01/proposal"]}><App /></MemoryRouter>);
    const user = userEvent.setup();
    await screen.findByText("Displayed executive-summary A");
    await user.click(screen.getAllByRole("button", { name: "Approve section" })[0]!);
    expect(await screen.findByText(/Approval was not applied/)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Approve section" })[0]).toBeDisabled();
    expect(reads).toBe(1);
    await user.click(screen.getByRole("button", { name: "Refresh proposal for review" }));
    await screen.findByText("Changed content B");
    await user.click(screen.getAllByRole("button", { name: "Approve section" })[0]!);
    expect(await screen.findByText("1 of 12 sections approved")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(5);
  });

  it("binds complete approval to the displayed review set, refreshes after conflict, and enables normal export", async () => {
    const seen = proposal(true);
    let reads = 0;
    let approvals = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, options) => {
      if (String(url).includes("/api/session")) {
        return Response.json({
          mode: "development", id: "local-user", tenantId: "local-tenant",
          displayName: "Local Development Member", roles: ["ProposalFactory.WorkspaceMember"]
        });
      }
      if (options?.method === "POST") {
        expect(JSON.parse(options.body as string)).toEqual({
          expectedReviewVersion: approvals++ === 0 ? "review-a" : "review-b"
        });
        return approvals === 1
          ? Response.json({ error: "STALE_REVIEW", message: "The proposal changed since review." }, { status: 409 })
          : Response.json({ ...seen, reviewVersion: "review-b", status: "Approved" });
      }
      return Response.json({ ...seen, reviewVersion: reads++ === 0 ? "review-a" : "review-b" });
    });
    render(<MemoryRouter initialEntries={["/opportunities/opp-01/proposal"]}><App /></MemoryRouter>);
    const user = userEvent.setup();
    await screen.findByText("12 of 12 sections approved");
    await waitFor(() => expect(screen.getByRole("button", { name: "Approve complete proposal" })).toBeEnabled());
    await user.click(screen.getAllByRole("button", { name: "Edit" })[0]!);
    expect(screen.getByRole("button", { name: "Approve complete proposal" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Approve complete proposal" }));
    await screen.findByText(/Approval was not applied/);
    expect(screen.getByRole("button", { name: "Approve complete proposal" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Refresh proposal for review" }));
    await waitFor(() => expect(screen.queryByText(/Approval was not applied/)).not.toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Approve complete proposal" }));
    await screen.findByRole("button", { name: "Proposal approved" });
    expect(screen.getByRole("button", { name: "Export PDF" })).toBeEnabled();
  });
});
