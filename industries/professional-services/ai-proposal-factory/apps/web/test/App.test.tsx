import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App.js";

const developmentSession = {
  mode: "development",
  id: "11111111-1111-4111-8111-111111111111",
  tenantId: "22222222-2222-4222-8222-222222222222",
  displayName: "Local Development Member",
  roles: ["ProposalFactory.WorkspaceMember"]
} as const;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("core UI startup", () => {
  it.each([401, 403])("latches canonical session %s as a global access state", async (status) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("Unauthorized", { status }));
    render(<MemoryRouter><App /></MemoryRouter>);
    expect(await screen.findByRole("heading", {
      name: status === 401 ? "Sign-in required" : "Workspace access denied"
    })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in with Microsoft Entra ID" }))
      .toHaveAttribute("href", "/.auth/login/aad?post_login_redirect_uri=%2F");
    expect(screen.getByRole("button", { name: "Recheck access" })).toBeInTheDocument();
    expect(screen.queryByText("Active pipeline value")).not.toBeInTheDocument();
  });
  it("keeps a resource-level 403 as a local page error", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/api/session")) {
        return Response.json({
          mode: "entra", id: "member", tenantId: "tenant",
          displayName: "Workspace Member", roles: ["ProposalFactory.WorkspaceMember"]
        });
      }
      if (url.includes("/api/dashboard")) {
        return Response.json({
          error: "OPPORTUNITY_ACCESS_DENIED",
          message: "This opportunity is not available to the current member."
        }, { status: 403 });
      }
      return Response.json([]);
    });
    render(<MemoryRouter><App /></MemoryRouter>);
    expect(await screen.findByText("This opportunity is not available to the current member.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Workspace access denied" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Sign in with Microsoft Entra ID" })).not.toBeInTheDocument();
  });
  it("recovers from a stale access denial after the development session is rechecked", async () => {
    let sessionAttempts = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/api/session")) {
        sessionAttempts++;
        return sessionAttempts === 1
          ? new Response(JSON.stringify({ error: "WORKSPACE_ACCESS_DENIED" }), { status: 403 })
          : new Response(JSON.stringify({
              mode: "development",
              id: "11111111-1111-4111-8111-111111111111",
              tenantId: "22222222-2222-4222-8222-222222222222",
              displayName: "Local Development Member",
              roles: ["ProposalFactory.WorkspaceMember"]
            }), { status: 200, headers: { "content-type": "application/json" } });
      }
      const body = url.includes("/api/dashboard")
        ? { opportunities: 10, activeValue: 4200000, proposalsInReview: 0, approvedProposals: 0 }
        : [];
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    });
    const user = userEvent.setup();
    render(<MemoryRouter><App /></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: "Workspace access denied" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Recheck access" }));
    expect(await screen.findByRole("heading", {
      name: "Turn qualified opportunities into review-ready proposals."
    })).toBeInTheDocument();
    expect(sessionAttempts).toBe(2);
  });
  it("keeps development document denials local and never offers an Entra redirect", async () => {
    const opportunity = {
      id: "opp-01",
      customerName: "Northstar Foods",
      name: "Cloud modernization program",
      industry: "Retail",
      estimatedValue: 365000,
      expectedDurationWeeks: 16,
      businessProblem: "Legacy platforms slow delivery.",
      expectedOutcomes: ["Faster delivery"],
      scope: "Modernize priority workloads.",
      stakeholders: ["CTO"],
      constraints: ["Peak season"],
      targetTimeline: "Q1 2027",
      budgetAssumptions: "Blended team",
      additionalNotes: "",
      scenario: "Cloud modernization",
      status: "Discovery",
      proposalStatus: "Draft",
      proposalProgress: 0,
      selectedDocumentIds: [],
      createdAt: "2026-09-07T09:00:00.000Z",
      updatedAt: "2026-09-07T09:00:00.000Z"
    };
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/api/session")) {
        return Response.json(developmentSession);
      }
      if (url.includes("/api/documents")) {
        return Response.json({
          error: "DOCUMENT_ACCESS_DENIED",
          message: "The meeting notes are not available."
        }, { status: 403 });
      }
      if (url.includes("/retrieval-preview")) {
        return Response.json({ citations: [], mode: "fixture", warnings: [] });
      }
      return Response.json(opportunity);
    });
    render(
      <MemoryRouter initialEntries={["/opportunities/opp-01"]}>
        <App />
      </MemoryRouter>
    );
    expect(await screen.findByText("The meeting notes are not available.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Workspace access denied" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Sign in with Microsoft Entra ID" })).not.toBeInTheDocument();
  });
  it("renders navigation and the seeded opportunity dashboard", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/api/session")) return Response.json(developmentSession);
      const body = url.includes("/api/dashboard")
        ? { opportunities: 10, activeValue: 4200000, proposalsInReview: 0, approvedProposals: 0 }
        : [
            {
              id: "opp-01",
              customerName: "Northstar Foods",
              name: "Cloud modernization program",
              industry: "Retail",
              estimatedValue: 365000,
              expectedDurationWeeks: 16,
              businessProblem: "Legacy platforms slow delivery.",
              expectedOutcomes: ["Faster delivery"],
              scope: "Modernize priority workloads.",
              stakeholders: ["CTO"],
              constraints: ["Peak season"],
              targetTimeline: "Q1 2027",
              budgetAssumptions: "Blended team",
              additionalNotes: "",
              scenario: "Cloud modernization",
              status: "Discovery",
              proposalStatus: "Draft",
              proposalProgress: 0,
              selectedDocumentIds: [],
              createdAt: "2026-09-07T09:00:00.000Z",
              updatedAt: "2026-09-07T09:00:00.000Z"
            }
          ];
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    });

    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    );
    expect(screen.getAllByText("AI Proposal Factory")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Content library" })).toBeInTheDocument();
    expect(await screen.findByText("Cloud modernization program")).toBeInTheDocument();
    expect(screen.getByText("$4,200,000")).toBeInTheDocument();
  });

  it("shows real upload progress, success details, and selected state", async () => {
    const opportunity = {
      id: "opp-01",
      customerName: "Northstar Foods",
      name: "Cloud modernization program",
      industry: "Retail",
      estimatedValue: 365000,
      expectedDurationWeeks: 16,
      businessProblem: "Legacy platforms slow delivery.",
      expectedOutcomes: ["Faster delivery"],
      scope: "Modernize priority workloads.",
      stakeholders: ["CTO"],
      constraints: ["Peak season"],
      targetTimeline: "Q1 2027",
      budgetAssumptions: "Blended team",
      additionalNotes: "",
      scenario: "Cloud modernization",
      status: "Discovery",
      proposalStatus: "Draft",
      proposalProgress: 0,
      selectedDocumentIds: [],
      createdAt: "2026-09-07T09:00:00.000Z",
      updatedAt: "2026-09-07T09:00:00.000Z"
    };
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("/api/session")) return Response.json(developmentSession);
      if (url.includes("/documents/selection") && init?.method === "PUT") {
        return new Response(JSON.stringify({ ...opportunity, selectedDocumentIds: ["doc-upload-1"] }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      const body = url.includes("/api/documents")
        ? []
        : url.includes("/retrieval-preview")
          ? { citations: [], mode: "fixture", warnings: ["Deterministic fixture evidence; no Azure services were called."] }
          : opportunity;
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    });

    class FakeUploadRequest {
      static current: FakeUploadRequest;
      status = 0;
      response: unknown;
      uploadListeners = new Map<string, (event: ProgressEvent) => void>();
      listeners = new Map<string, () => void>();
      upload = {
        addEventListener: (name: string, listener: (event: ProgressEvent) => void) =>
          this.uploadListeners.set(name, listener)
      };
      constructor() {
        FakeUploadRequest.current = this;
      }
      open() {}
      setRequestHeader() {}
      send() {}
      addEventListener(name: string, listener: () => void) {
        this.listeners.set(name, listener);
      }
      progress(loaded: number, total: number) {
        this.uploadListeners.get("progress")?.({ lengthComputable: true, loaded, total } as ProgressEvent);
      }
      complete(status: number, response: unknown) {
        this.status = status;
        this.response = response;
        this.listeners.get("load")?.();
      }
    }
    vi.stubGlobal("XMLHttpRequest", FakeUploadRequest);
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/opportunities/opp-01"]}>
        <App />
      </MemoryRouter>
    );
    expect(await screen.findByText("Cloud modernization program")).toBeInTheDocument();
    const file = new File(["Customer needs resilient ordering."], "meeting-notes.txt", { type: "text/plain" });
    await user.upload(screen.getByLabelText("+ Add document"), file);
    FakeUploadRequest.current.progress(5, 10);
    expect(await screen.findByText("50% uploaded")).toBeInTheDocument();
    FakeUploadRequest.current.complete(201, {
      id: "doc-upload-1",
      opportunityId: "opp-01",
      name: "meeting-notes.txt",
      kind: "Meeting Notes",
      contentType: "text/plain",
      sizeBytes: file.size,
      source: "Upload",
      summary: "Customer needs resilient ordering.",
      storageProvider: "Local",
      storageKey: "opp-01/doc-upload-1/doc-upload-1.txt",
      sha256: "a".repeat(64),
      extractionMethod: "Plain Text",
      extractedTextCharacters: 34,
      createdAt: "2026-09-07T10:00:00.000Z"
    });
    expect(await screen.findByText(/uploaded, text extracted, and selected/)).toBeInTheDocument();
    expect(screen.getByText(/Plain Text extraction/)).toBeInTheDocument();
    expect(screen.getByRole("checkbox")).toBeChecked();
  });

  it("shows a clear upload failure without adding a document", async () => {
    const opportunity = {
      id: "opp-01",
      customerName: "Northstar Foods",
      name: "Cloud modernization program",
      industry: "Retail",
      estimatedValue: 365000,
      expectedDurationWeeks: 16,
      businessProblem: "Legacy platforms slow delivery.",
      expectedOutcomes: ["Faster delivery"],
      scope: "Modernize priority workloads.",
      stakeholders: ["CTO"],
      constraints: ["Peak season"],
      targetTimeline: "Q1 2027",
      budgetAssumptions: "Blended team",
      additionalNotes: "",
      scenario: "Cloud modernization",
      status: "Discovery",
      proposalStatus: "Draft",
      proposalProgress: 0,
      selectedDocumentIds: [],
      createdAt: "2026-09-07T09:00:00.000Z",
      updatedAt: "2026-09-07T09:00:00.000Z"
    };
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/api/session")) return Response.json(developmentSession);
      const body = url.includes("/retrieval-preview")
        ? { citations: [], mode: "fixture", warnings: [] }
        : url.includes("/api/documents") ? [] : opportunity;
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    });
    class FailedUploadRequest {
      static current: FailedUploadRequest;
      status = 0;
      response: unknown;
      upload = { addEventListener: vi.fn() };
      listeners = new Map<string, () => void>();
      constructor() {
        FailedUploadRequest.current = this;
      }
      open() {}
      setRequestHeader() {}
      send() {}
      addEventListener(name: string, listener: () => void) {
        this.listeners.set(name, listener);
      }
      fail(message: string) {
        this.status = 400;
        this.response = { message };
        this.listeners.get("load")?.();
      }
    }
    vi.stubGlobal("XMLHttpRequest", FailedUploadRequest);
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/opportunities/opp-01"]}>
        <App />
      </MemoryRouter>
    );
    expect(await screen.findByText("Cloud modernization program")).toBeInTheDocument();
    await user.upload(
      screen.getByLabelText("+ Add document"),
      new File(["not a pdf"], "scan.pdf", { type: "application/pdf" })
    );
    FailedUploadRequest.current.fail("The PDF signature is invalid.");
    expect(await screen.findAllByText("The PDF signature is invalid.")).not.toHaveLength(0);
    expect(screen.queryByText(/PDF extraction/)).not.toBeInTheDocument();
  });
});
