import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowserRouter, MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App.js";

const session = {
  mode: "development",
  id: "member",
  tenantId: "tenant",
  displayName: "Local Development Member",
  roles: ["ProposalFactory.WorkspaceMember"]
};
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
const document = {
  id: "doc-01",
  name: "Northstar discovery meeting notes.md",
  kind: "Meeting Notes",
  contentType: "text/markdown",
  sizeBytes: 2048,
  source: "Fixture",
  summary: "Customer needs resilient ordering.",
  extractedText: "Customer needs resilient ordering and clear recovery ownership.",
  createdAt: "2026-09-07T09:00:00.000Z"
};
const content = {
  id: "content-01",
  title: "Retail resilience pattern",
  kind: "Proposal Snippet",
  scenario: "Cloud modernization",
  industries: ["Retail"],
  tags: ["resilience"],
  summary: "Reusable resilience guidance.",
  body: "Confirm recovery objectives and ownership.",
  updatedAt: "2026-09-07T09:00:00.000Z",
  indexing: {
    provider: "local",
    librarySearch: "available",
    retrievalIndex: "available",
    message: "Available immediately to local keyword search and deterministic retrieval."
  }
};

function json(value: unknown, init?: ResponseInit) {
  return Response.json(value, init);
}

function baseFetch(input: RequestInfo | URL, init?: RequestInit) {
  const url = String(input);
  if (url.includes("/api/session")) return Promise.resolve(json(session));
  if (url.includes("/api/dashboard")) {
    return Promise.resolve(json({ opportunities: 1, activeValue: 365000, proposalsInReview: 0, approvedProposals: 0 }));
  }
  if (url.includes("/retrieval-preview")) {
    return Promise.resolve(json({ citations: [], mode: "fixture", warnings: ["Deterministic fixture evidence; no Azure services were called."] }));
  }
  if (url.includes("/api/opportunities/opp-01/documents/doc-01")) return Promise.resolve(json(document));
  if (url.includes("/api/documents")) return Promise.resolve(json([document]));
  if (url.endsWith("/api/opportunities")) return Promise.resolve(json([opportunity]));
  if (url.includes("/api/opportunities/opp-01")) return Promise.resolve(json(opportunity));
  if (url.includes("/api/content/content-01")) return Promise.resolve(json(content));
  if (url.includes("/api/content") && init?.method === "POST") return Promise.resolve(json(content, { status: 201 }));
  if (url.includes("/api/content")) return Promise.resolve(json([content]));
  if (url.includes("/api/audit")) return Promise.resolve(json([]));
  return Promise.resolve(json([]));
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
});

describe("design review product actions", () => {
  it("navigates without reload and restores route query state with browser history", async () => {
    let sessionCalls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      if (String(input).includes("/api/session")) sessionCalls += 1;
      return baseFetch(input, init);
    });
    window.history.replaceState({}, "", "/");
    const user = userEvent.setup();
    render(<BrowserRouter><App /></BrowserRouter>);
    expect(await screen.findByText("Cloud modernization program")).toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: "Content library" }));
    expect(await screen.findByRole("heading", { name: "Reusable content library" })).toBeInTheDocument();
    await user.selectOptions(screen.getByDisplayValue("All content types"), "Proposal Snippet");
    expect(window.location.search).toContain("kind=Proposal+Snippet");
    await user.click(screen.getByRole("link", { name: "Audit history" }));
    expect(await screen.findByRole("heading", { name: "Audit history" })).toBeInTheDocument();
    window.history.back();
    await waitFor(() => expect(window.location.pathname).toBe("/library"));
    expect(screen.getByDisplayValue("Proposal Snippet")).toBeInTheDocument();
    expect(sessionCalls).toBe(1);
  });

  it("opens meeting notes through the same-origin application endpoint in development", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(baseFetch);
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/opportunities/opp-01"]}><App /></MemoryRouter>);
    await user.click(await screen.findByRole("link", { name: /Northstar discovery meeting notes/ }));
    expect(await screen.findByRole("heading", { name: document.name })).toBeInTheDocument();
    expect(screen.getByText(document.extractedText)).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      "/api/opportunities/opp-01/documents/doc-01",
      expect.objectContaining({ credentials: "same-origin", redirect: "manual" })
    );
    expect(screen.queryByText("Sign in with Microsoft Entra ID")).not.toBeInTheDocument();
  });

  it("applies document filters restored from URL query parameters", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(baseFetch);
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/opportunities/opp-01?documentKind=Requirements"]}>
        <App />
      </MemoryRouter>
    );
    expect(await screen.findByText("No matching documents")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Filter documents by type"), "Meeting Notes");
    expect(await screen.findByRole("link", { name: /Northstar discovery meeting notes/ })).toBeInTheDocument();
  });

  it("retains an uploaded document when selection fails and retries selection without uploading twice", async () => {
    let selectionAttempts = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("/documents/selection")) {
        selectionAttempts += 1;
        return selectionAttempts === 1
          ? json({ error: "TEMPORARY_SELECTION_FAILURE", message: "Selection service is temporarily unavailable." }, { status: 503 })
          : json({ ...opportunity, selectedDocumentIds: ["doc-upload-1"] });
      }
      return baseFetch(input, init);
    });
    class UploadRequest {
      static instances = 0;
      static current: UploadRequest;
      status = 0;
      response: unknown;
      withCredentials = false;
      upload = { addEventListener: vi.fn() };
      listeners = new Map<string, () => void>();
      constructor() {
        UploadRequest.instances += 1;
        UploadRequest.current = this;
      }
      open() {}
      setRequestHeader() {}
      send() {}
      addEventListener(name: string, listener: () => void) { this.listeners.set(name, listener); }
      complete() {
        this.status = 201;
        this.response = {
          ...document,
          id: "doc-upload-1",
          name: "new-notes.txt",
          source: "Upload",
          extractionMethod: "Plain Text",
          extractedTextCharacters: 24
        };
        this.listeners.get("load")?.();
      }
    }
    vi.stubGlobal("XMLHttpRequest", UploadRequest);
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/opportunities/opp-01"]}><App /></MemoryRouter>);
    await screen.findByText(opportunity.name);
    await user.upload(screen.getByLabelText("+ Add document"), new File(["new notes"], "new-notes.txt", { type: "text/plain" }));
    UploadRequest.current.complete();
    expect(await screen.findByText(/uploaded but not selected/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry selection" }));
    expect(await screen.findByText(/uploaded, text extracted, and selected/)).toBeInTheDocument();
    expect(UploadRequest.instances).toBe(1);
    expect(selectionAttempts).toBe(2);
  });

  it("reconciles a persisted upload after a transport interruption instead of requesting a duplicate upload", async () => {
    const persisted = {
      ...document,
      id: "doc-upload-2",
      name: "recovered-notes.txt",
      source: "Upload",
      sizeBytes: 15,
      extractionMethod: "Plain Text",
      extractedTextCharacters: 15,
      createdAt: "2026-09-08T10:00:00.000Z"
    };
    let documentReads = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("/api/documents")) {
        documentReads += 1;
        return json(documentReads === 1 ? [document] : [document, persisted]);
      }
      if (url.includes("/documents/selection")) {
        return json({ ...opportunity, selectedDocumentIds: [persisted.id] });
      }
      return baseFetch(input, init);
    });
    class InterruptedUploadRequest {
      static instances = 0;
      static current: InterruptedUploadRequest;
      status = 0;
      response: unknown;
      withCredentials = false;
      upload = { addEventListener: vi.fn() };
      listeners = new Map<string, () => void>();
      constructor() {
        InterruptedUploadRequest.instances += 1;
        InterruptedUploadRequest.current = this;
      }
      open() {}
      setRequestHeader() {}
      send() {}
      addEventListener(name: string, listener: () => void) { this.listeners.set(name, listener); }
      interrupt() { this.listeners.get("error")?.(); }
    }
    vi.stubGlobal("XMLHttpRequest", InterruptedUploadRequest);
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/opportunities/opp-01"]}><App /></MemoryRouter>);
    await screen.findByText(opportunity.name);
    await user.upload(
      screen.getByLabelText("+ Add document"),
      new File(["123456789012345"], persisted.name, { type: "text/plain" })
    );
    InterruptedUploadRequest.current.interrupt();
    expect(await screen.findByText(/uploaded, text extracted, and selected/)).toBeInTheDocument();
    expect(InterruptedUploadRequest.instances).toBe(1);
  });

  it("creates and opens reusable content and reports its real indexing state", async () => {
    let posted: unknown;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (String(input).includes("/api/content") && init?.method === "POST") {
        posted = JSON.parse(String(init.body));
        return json(content, { status: 201 });
      }
      return baseFetch(input, init);
    });
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/library/new"]}><App /></MemoryRouter>);
    await user.type(await screen.findByLabelText(/Title/), content.title);
    await user.type(screen.getByLabelText(/Industries/), "Retail");
    await user.type(screen.getByLabelText(/Tags/), "resilience");
    await user.type(screen.getByLabelText(/Summary/), content.summary);
    await user.type(screen.getByLabelText(/Content body/), content.body);
    await user.click(screen.getByRole("button", { name: "Create content" }));
    expect(await screen.findByRole("heading", { name: content.title })).toBeInTheDocument();
    expect(screen.getByText(content.indexing.message)).toBeInTheDocument();
    expect(posted).toMatchObject({ title: content.title, industries: ["Retail"], tags: ["resilience"] });
  });

  it("clears a transient library error after a successful filtered retry", async () => {
    let contentCalls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (String(input).includes("/api/content")) {
        contentCalls += 1;
        if (contentCalls === 1) return json({ message: "Temporary content failure." }, { status: 503 });
      }
      return baseFetch(input, init);
    });
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/library"]}><App /></MemoryRouter>);
    expect(await screen.findByText("Temporary content failure.")).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText("Search titles, tags, and content"), "resilience");
    expect(await screen.findByText(content.title)).toBeInTheDocument();
    expect(screen.queryByText("Temporary content failure.")).not.toBeInTheDocument();
  });

  it.each([
    {
      provider: "fixture",
      execution: "deterministic",
      label: "Deterministic fixture",
      evidence: { successfulModelOperations: 0, successfulRetrievalOperations: 1, successfulEmbeddingOperations: 0, deterministicOperations: 4 }
    },
    {
      provider: "azure",
      execution: "model-backed",
      label: "Azure model-backed",
      evidence: { successfulModelOperations: 3, successfulRetrievalOperations: 1, successfulEmbeddingOperations: 1, deterministicOperations: 0 }
    }
  ])("renders truthful $provider generation evidence", async ({ provider, execution, label, evidence }) => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (String(input).includes("/api/generation-runs/run-01")) {
        return json({
          id: "run-01",
          opportunityId: "opp-01",
          proposalId: "proposal-01",
          status: "Running",
          progress: 25,
          stages: [{
            key: "requirements",
            label: "Analyze requirements",
            detail: "Recorded execution",
            status: "Running",
            execution,
            completedOperations: 1
          }],
          retrievedContentIds: [],
          retrieval: { mode: provider === "azure" ? "hybrid" : "fixture", warnings: [] },
          providerEvidence: { provider, fallbacks: [], ...evidence },
          startedAt: "2026-09-08T09:00:00.000Z"
        });
      }
      return baseFetch(input, init);
    });
    render(<MemoryRouter initialEntries={["/opportunities/opp-01/generate/run-01"]}><App /></MemoryRouter>);
    expect(await screen.findByText(new RegExp(label))).toBeInTheDocument();
    expect(screen.getByText(`${evidence.successfulModelOperations} model operations`)).toBeInTheDocument();
    expect(screen.getByText(/Structures business goals/)).toBeInTheDocument();
  });
});
