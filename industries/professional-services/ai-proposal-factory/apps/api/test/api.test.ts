import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { proposalSectionKeys, type OpportunityInput, type Proposal, type ReusableContentInput } from "@proposal-factory/contracts";
import type { IdGenerator } from "@proposal-factory/domain";
import { createApp } from "../src/app.js";

class TestIds implements IdGenerator {
  private sequence = 0;
  next(prefix: string) {
    return `${prefix}-test-${++this.sequence}`;
  }
}

const clock = { now: () => "2026-09-07T10:00:00.000Z" };
let app: FastifyInstance;

async function completeGeneration(opportunityId: string) {
  const started = await app.inject({ method: "POST", url: `/api/opportunities/${opportunityId}/proposals/generate` });
  expect(started.statusCode).toBe(202);
  const runId = started.json().id as string;
  for (let index = 0; index < 4; index += 1) {
    const progress = await app.inject({ method: "GET", url: `/api/generation-runs/${runId}` });
    expect(progress.statusCode).toBe(200);
  }
  const response = await app.inject({ method: "GET", url: `/api/opportunities/${opportunityId}/proposal` });
  expect(response.statusCode).toBe(200);
  return response.json<Proposal>();
}

async function extractPdf(payload: Buffer) {
  const task = getDocument({
    data: new Uint8Array(payload),
    disableFontFace: true,
    useSystemFonts: false
  });
  const document = await task.promise;
  try {
    const pages: string[] = [];
    const overflow: string[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const viewport = page.getViewport({ scale: 1 });
      for (const item of content.items) {
        if ("str" in item && item.str.trim() &&
            (item.transform[4] < 0 || item.transform[4] + item.width > viewport.width + 1 ||
             item.transform[5] < 0 || item.transform[5] > viewport.height)) {
          overflow.push(`Page ${pageNumber}: ${item.str}`);
        }
      }
      pages.push(
        content.items
          .filter((item): item is typeof item & { str: string } => "str" in item)
          .map((item) => item.str)
          .join(" ")
      );
    }
    return { pageCount: document.numPages, pages, overflow, text: pages.join("\n").replace(/\s+/g, " ").trim() };
  } finally {
    await task.destroy();
  }
}

beforeEach(async () => {
  ({ app } = await createApp({ clock, ids: new TestIds() }));
});

afterEach(async () => {
  await app.close();
  vi.unstubAllEnvs();
});

describe("opportunity management", () => {
  it("lists seeded opportunities and creates a complete opportunity", async () => {
    const list = await app.inject({ method: "GET", url: "/api/opportunities" });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toHaveLength(10);

    const input: OpportunityInput = {
      customerName: "Summit Aviation",
      name: "Operations AI assistant",
      industry: "Aviation",
      estimatedValue: 450000,
      expectedDurationWeeks: 18,
      businessProblem: "Operations teams spend too long finding approved procedures.",
      expectedOutcomes: ["Reduce knowledge search time"],
      scope: "Deliver a grounded operations assistant pilot.",
      stakeholders: ["COO", "Operations director"],
      constraints: ["Use approved content only"],
      targetTimeline: "Q1 2027",
      budgetAssumptions: "A blended team for 18 weeks.",
      additionalNotes: "Start with disruption management.",
      scenario: "AI adoption"
    };
    const created = await app.inject({ method: "POST", url: "/api/opportunities", payload: input });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ customerName: input.customerName, proposalStatus: "Draft" });
    const updatedList = await app.inject({ method: "GET", url: "/api/opportunities" });
    expect(updatedList.json()).toHaveLength(11);
  });
});

describe("retrieval boundary", () => {
  it("returns visibly different grounded content for different scenarios", async () => {
    const cloud = await app.inject({ method: "GET", url: "/api/opportunities/opp-01/retrieval-preview" });
    const ai = await app.inject({ method: "GET", url: "/api/opportunities/opp-03/retrieval-preview" });
    expect(cloud.statusCode).toBe(200);
    expect(ai.statusCode).toBe(200);
    expect(cloud.json()).toMatchObject({
      mode: "fixture",
      warnings: ["Deterministic fixture evidence; no Azure services were called."]
    });
    expect(cloud.json().citations[0].contentId).not.toBe(ai.json().citations[0].contentId);
    expect(cloud.json().citations[0].title.toLowerCase()).toContain("cloud modernization");
    expect(ai.json().citations[0].title.toLowerCase()).toContain("ai adoption");
  });
});

describe("document and reusable content details", () => {
  it("opens documents through the opportunity-scoped application API", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/opportunities/opp-01/documents/doc-01"
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: "doc-01",
      kind: "Meeting Notes",
      source: "Fixture"
    });
  });

  it("creates content that is immediately openable, searchable, and filterable in local mode", async () => {
    const input: ReusableContentInput = {
      title: "Retail resilience discovery pattern",
      kind: "Proposal Snippet",
      scenario: "Cloud modernization",
      industries: ["Retail"],
      tags: ["resilience", "discovery"],
      summary: "A reusable discovery pattern for resilient retail services.",
      body: "Assess peak-season constraints, recovery objectives, and operational ownership."
    };
    const created = await app.inject({ method: "POST", url: "/api/content", payload: input });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      ...input,
      indexing: {
        provider: "local",
        librarySearch: "available",
        retrievalIndex: "available"
      }
    });

    const id = created.json().id as string;
    const detail = await app.inject({ method: "GET", url: `/api/content/${id}` });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().title).toBe(input.title);

    const search = await app.inject({
      method: "GET",
      url: "/api/content?q=resilience&kind=Proposal%20Snippet&scenario=Cloud%20modernization&industry=Retail"
    });
    expect(search.statusCode).toBe(200);
    expect(search.json().some((item: { id: string }) => item.id === id)).toBe(true);
  });

  it("rejects incomplete reusable content without persisting it", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/content",
      payload: {
        title: "",
        kind: "Proposal Snippet",
        scenario: "Cloud modernization",
        industries: [],
        tags: [],
        summary: "",
        body: ""
      }
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: "VALIDATION_ERROR" });
  });

  it("reports Azure library persistence separately from pending AI Search ingestion", async () => {
    const azure = await createApp({ clock, ids: new TestIds(), dataProvider: "azure" });
    try {
      const response = await azure.app.inject({ method: "GET", url: "/api/content/snippet-1-1" });
      expect(response.statusCode).toBe(200);
      expect(response.json().indexing).toMatchObject({
        provider: "azure",
        librarySearch: "available",
        retrievalIndex: "pending"
      });
    } finally {
      await azure.app.close();
    }
  });
});

describe("proposal generation and exports", () => {
  it("generates twelve sections, enforces approvals, and exports Markdown and PDF", async () => {
    const proposal = await completeGeneration("opp-01");
    expect(proposal.sections).toHaveLength(12);
    expect(proposal.risks.length).toBeGreaterThanOrEqual(4);
    expect(proposal.citations.length).toBeGreaterThanOrEqual(5);

    const blockedExport = await app.inject({
      method: "GET",
      url: `/api/proposals/${proposal.id}/export?format=markdown`
    });
    expect(blockedExport.statusCode).toBe(409);
    const blockedPdf = await app.inject({
      method: "GET",
      url: `/api/proposals/${proposal.id}/export?format=pdf`
    });
    expect(blockedPdf.statusCode).toBe(409);

    for (const key of proposalSectionKeys) {
      const approval = await app.inject({
        method: "POST",
        url: `/api/proposals/${proposal.id}/sections/${key}/approve`,
        payload: { expectedRevisionId: proposal.sections.find((section) => section.key === key)!.currentRevisionId }
      });
      expect(approval.statusCode).toBe(200);
    }
    const approval = await app.inject({ method: "POST", url: `/api/proposals/${proposal.id}/approve`,
      payload: { expectedReviewVersion: (await app.inject(`/api/proposals/${proposal.id}`)).json().reviewVersion } });
    expect(approval.statusCode).toBe(200);
    expect(approval.json().status).toBe("Approved");

    const markdown = await app.inject({
      method: "GET",
      url: `/api/proposals/${proposal.id}/export?format=markdown`
    });
    expect(markdown.statusCode).toBe(200);
    expect(markdown.headers["content-type"]).toContain("text/markdown");
    expect(markdown.body).toContain("# Northstar Foods");
    expect(markdown.body).toContain("## Supporting Sources");

    const pdf = await app.inject({ method: "GET", url: `/api/proposals/${proposal.id}/export?format=pdf` });
    expect(pdf.statusCode).toBe(200);
    expect(pdf.headers["content-type"]).toContain("application/pdf");
    expect(pdf.rawPayload.subarray(0, 4).toString()).toBe("%PDF");
  });

  it("preserves Unicode approved content in a professional multipage PDF", async () => {
    const opportunity: OpportunityInput = {
      customerName: "Élodie Müller — 株式会社さくら",
      name: "تحول الخدمات – सेवा आधुनिकीकरण",
      industry: "Professional Services",
      estimatedValue: 875000,
      expectedDurationWeeks: 24,
      businessProblem: "Regional teams need one governed proposal workflow across languages.",
      expectedOutcomes: ["Reduce review time by ≥ 20%", "Meet recovery targets ≤ 4 hours"],
      scope: "Deliver a multilingual proposal operating model.",
      stakeholders: ["José Álvarez", "山田 太郎", "فاطمة الزهراء"],
      constraints: ["Preserve approved wording and punctuation exactly"],
      targetTimeline: "Q2 2027",
      budgetAssumptions: "€875,000 with staged approval gates.",
      additionalNotes: "Customer phrase: “No silent substitutions.”",
      scenario: "AI adoption"
    };
    const created = await app.inject({ method: "POST", url: "/api/opportunities", payload: opportunity });
    expect(created.statusCode).toBe(201);
    const opportunityId = created.json().id as string;
    const proposal = await completeGeneration(opportunityId);
    const unicodeContent =
      "Recovery target ≤ 4 hours; measurable improvement ≥ 20%.\n\n" +
      "**Reviewed owners:** Élodie Müller, José Álvarez, 山田 太郎, فاطمة الزهراء, अनन्या शर्मा, मीरा देवी.\n\n" +
      "Approved punctuation: “customer-first” — €875,000 • scope A/B; no substitutions.";
    const longParagraph =
      "This approved delivery paragraph intentionally exercises professional wrapping and pagination while preserving every reviewed commitment, owner, threshold, and punctuation mark across page boundaries.";

    for (const [index, key] of proposalSectionKeys.entries()) {
      const content =
        index === 0
          ? `${unicodeContent}\n\n${Array.from({ length: 55 }, (_, paragraph) => `Commitment-${String(paragraph + 1).padStart(3, "0")}: ${longParagraph}`).join("\n\n")}\n\nFINAL-APPROVED-COMMITMENT`
          : `${unicodeContent}\n\n${longParagraph}`;
      const edited = await app.inject({
        method: "PATCH",
        url: `/api/proposals/${proposal.id}/sections/${key}`,
        payload: { content }
      });
      expect(edited.statusCode).toBe(200);
      const approved = await app.inject({
        method: "POST",
        url: `/api/proposals/${proposal.id}/sections/${key}/approve`,
        payload: { expectedRevisionId: edited.json<Proposal>().sections.find((section) => section.key === key)!.currentRevisionId }
      });
      expect(approved.statusCode).toBe(200);
    }
    const approvedProposal = await app.inject({ method: "POST", url: `/api/proposals/${proposal.id}/approve`,
      payload: { expectedReviewVersion: (await app.inject(`/api/proposals/${proposal.id}`)).json().reviewVersion } });
    expect(approvedProposal.statusCode).toBe(200);

    const markdown = await app.inject({
      method: "GET",
      url: `/api/proposals/${proposal.id}/export?format=markdown`
    });
    expect(markdown.statusCode).toBe(200);
    expect(markdown.body).toContain(unicodeContent);
    expect(markdown.body).toContain("Recovery target ≤ 4 hours; measurable improvement ≥ 20%.");
    expect(markdown.body).toContain("山田 太郎, فاطمة الزهراء, अनन्या शर्मा");

    const pdf = await app.inject({ method: "GET", url: `/api/proposals/${proposal.id}/export?format=pdf` });
    expect(pdf.statusCode).toBe(200);
    expect(pdf.headers["content-type"]).toContain("application/pdf");
    expect(pdf.rawPayload.subarray(0, 5).toString()).toBe("%PDF-");
    const extracted = await extractPdf(pdf.rawPayload);
    expect(extracted.pageCount).toBeGreaterThanOrEqual(6);
    expect(extracted.overflow).toEqual([]);
    expect(extracted.text).toContain("Élodie Müller");
    expect(extracted.text).toContain("Recovery target ≤ 4 hours");
    expect(extracted.text).toContain("measurable improvement ≥ 20%");
    expect(extracted.text).toContain("山田 太郎");
    // Arabic presentation forms normalize for extraction; simple Devanagari avoids extractor-specific conjunct ordering.
    for (const character of new Set("فاطمةالزهراءमीरादेवी")) {
      expect(extracted.text.normalize("NFKC")).toContain(character);
    }
    expect(extracted.text).toContain("“customer-first” — €875,000 • scope A/B; no substitutions.");
    for (let paragraph = 1; paragraph <= 55; paragraph += 1) {
      expect(extracted.text).toContain(`Commitment-${String(paragraph).padStart(3, "0")}`);
    }
    expect(extracted.text).toContain("FINAL-APPROVED-COMMITMENT");
    for (const section of proposal.sections) expect(extracted.text).toContain(section.title);
    expect(extracted.text).toContain("Risk Register");
    expect(extracted.text).toContain("Supporting Sources");
    for (const risk of proposal.risks) {
      expect(extracted.text).toContain(risk.title);
      expect(extracted.text).toContain(risk.description);
      expect(extracted.text).toContain(risk.mitigation);
    }
    for (const citation of proposal.citations) {
      expect(extracted.text).toContain(citation.title);
      expect(extracted.text).toContain(citation.excerpt.replace(/\s+/g, " "));
    }
  }, 60_000);

  it("wraps long tokens and code, preserves literal HTML, and repeats the approved layout", async () => {
    const proposal = await completeGeneration("opp-01");
    const token = "ApprovedReference0123456789".repeat(14);
    const content = `## Reviewed commitments\n\n` +
      `Literal HTML: <script>reviewed_not_executed()</script> & <customer>Élodie</customer>.\n\n` +
      `Literal entity spelling: &lt;customer&gt;.\n\n` +
      `Inline identifier: ${token}\n\n` +
      `\`\`\`text\n${token}\nthreshold ≤ 4; improvement ≥ 20%\n<limit>≤ 4 & ≥ 20%</limit>\n\`\`\`\n\n` +
      `Inline code: \`<owner>José & Élodie</owner>\`.\n\n` +
      `[Approved source](https://example.invalid/review?q=≥20%&owner=José)\n\n` +
      `![Reviewed diagram ≥ 20%](https://example.invalid/diagram.png)\n\nEND-OF-APPROVED-CODE`;
    const edited = await app.inject({
      method: "PATCH",
      url: `/api/proposals/${proposal.id}/sections/scope`,
      payload: { content }
    });
    expect(edited.statusCode).toBe(200);
    for (const key of proposalSectionKeys) {
      expect((await app.inject({
        method: "POST", url: `/api/proposals/${proposal.id}/sections/${key}/approve`,
        payload: { expectedRevisionId: edited.json<Proposal>().sections.find((section) => section.key === key)!.currentRevisionId }
      })).statusCode).toBe(200);
    }
    expect((await app.inject({ method: "POST", url: `/api/proposals/${proposal.id}/approve`,
      payload: { expectedReviewVersion: (await app.inject(`/api/proposals/${proposal.id}`)).json().reviewVersion } })).statusCode).toBe(200);
    const markdown = await app.inject({ method: "GET", url: `/api/proposals/${proposal.id}/export?format=markdown` });
    expect(markdown.body).toContain(content);
    const render = async () => {
      const response = await app.inject({ method: "GET", url: `/api/proposals/${proposal.id}/export?format=pdf` });
      expect(response.statusCode).toBe(200);
      expect(response.headers["content-disposition"]).toContain(`${proposal.id}-approved.pdf`);
      return extractPdf(response.rawPayload);
    };
    const first = await render();
    expect(first.overflow).toEqual([]);
    expect(first.text).toContain("<script>reviewed_not_executed()</script>");
    expect(first.text).toContain("<customer>Élodie</customer>");
    expect(first.text).toContain("&lt;customer&gt;");
    expect(first.text.replace(/\s/g, "")).toContain(token);
    expect(first.text).toContain("threshold ≤ 4; improvement ≥ 20%");
    expect(first.text).toContain("<limit>≤ 4 & ≥ 20%</limit>");
    expect(first.text).toContain("<owner>José & Élodie</owner>");
    expect(first.text).toContain("[Approved source](https://example.invalid/review?q=≥20%&owner=José)");
    expect(first.text).toContain("![Reviewed diagram ≥ 20%](https://example.invalid/diagram.png)");
    expect(first.text).toContain("END-OF-APPROVED-CODE");
    expect(await render()).toEqual(first);
    expect((await app.inject({
      method: "PATCH", url: `/api/proposals/${proposal.id}/sections/scope`, payload: { content: "Unapproved replacement ≥ 30%." }
    })).statusCode).toBe(200);
    for (const format of ["markdown", "pdf"]) {
      expect((await app.inject({ method: "GET", url: `/api/proposals/${proposal.id}/export?format=${format}` })).statusCode).toBe(409);
    }
  }, 60_000);

  it("checks PDF approval before attempting to launch a missing browser", async () => {
    const proposal = await completeGeneration("opp-01");
    vi.stubEnv("PDF_CHROMIUM_EXECUTABLE_PATH", "missing-rendering-browser.exe");
    const pdf = await app.inject({ method: "GET", url: `/api/proposals/${proposal.id}/export?format=pdf` });
    expect(pdf.statusCode).toBe(409);
  });
});
