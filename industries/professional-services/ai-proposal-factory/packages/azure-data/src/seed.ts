import type { DocumentMetadata, Opportunity, ReusableContent } from "@proposal-factory/contracts";
import type { AzureDocumentBlobStore, AzureReusableContentBlobStore } from "./blob.js";
import type { CosmosSeedWriter } from "./cosmos.js";

export interface AzureSeedDataset {
  opportunities: Opportunity[];
  documents: DocumentMetadata[];
  content: ReusableContent[];
}

export interface SearchSeedRecord {
  id: string;
  title: string;
  kind: string;
  scenario: string;
  industries: string[];
  tags: string[];
  summary: string;
  content: string;
  sourceContainer: string;
  sourceKey: string;
  updatedAt: string;
}

export interface AzureSeedReport {
  cosmosCreated: number;
  cosmosSkipped: number;
  blobsCreated: number;
  blobsSkipped: number;
  searchRecords: SearchSeedRecord[];
}

export class AzureSeedService {
  constructor(
    private readonly cosmos: CosmosSeedWriter,
    private readonly documentBlobs: AzureDocumentBlobStore,
    private readonly contentBlobs: AzureReusableContentBlobStore
  ) {}

  async seed(dataset: AzureSeedDataset): Promise<AzureSeedReport> {
    const report: AzureSeedReport = {
      cosmosCreated: 0,
      cosmosSkipped: 0,
      blobsCreated: 0,
      blobsSkipped: 0,
      searchRecords: []
    };
    const recordCosmos = (created: boolean) => {
      if (created) report.cosmosCreated += 1;
      else report.cosmosSkipped += 1;
    };
    const recordBlob = (created: boolean, count = 1) => {
      if (created) report.blobsCreated += count;
      else report.blobsSkipped += count;
    };

    for (const opportunity of dataset.opportunities) {
      recordCosmos(
        await this.cosmos.putIfAbsent(
          "opportunities",
          opportunity,
          opportunity.id,
          "opportunity"
        )
      );
    }

    for (const document of dataset.documents) {
      const owner =
        document.opportunityId ??
        dataset.opportunities.find((opportunity) => opportunity.selectedDocumentIds.includes(document.id))?.id ??
        "shared";
      const body = new TextEncoder().encode(`# ${document.name}\n\n${document.summary}\n`);
      const storedDocument: DocumentMetadata = {
        ...document,
        ...(owner !== "shared" ? { opportunityId: owner } : {}),
        sizeBytes: body.byteLength
      };
      recordCosmos(
        await this.cosmos.putIfAbsent(
          "documents",
          storedDocument,
          owner,
          "document"
        )
      );
      const blob = await this.documentBlobs.uploadDocument({
        documentId: document.id,
        opportunityId: owner,
        fileName: document.name,
        kind: document.kind,
        contentType: document.contentType,
        sizeBytes: body.byteLength,
        data: body,
        ifAbsent: true
      });
      recordBlob(blob.created !== false);
    }

    for (const content of dataset.content) {
      const searchText = `${content.title} ${content.summary} ${content.body} ${content.tags.join(" ")}`;
      recordCosmos(
        await this.cosmos.putIfAbsent(
          "content",
          content,
          content.scenario,
          "content",
          { searchText }
        )
      );
      const markdown = new TextEncoder().encode(`# ${content.title}\n\n${content.body}\n`);
      const blobs = await this.contentBlobs.storeContent({
        contentId: content.id,
        fileName: `${content.id}.md`,
        contentType: "text/markdown",
        original: markdown,
        extractedText: content.body
      });
      report.blobsCreated += blobs.createdCount;
      report.blobsSkipped += blobs.skippedCount;
      report.searchRecords.push({
        id: content.id,
        title: content.title,
        kind: content.kind,
        scenario: content.scenario,
        industries: content.industries,
        tags: content.tags,
        summary: content.summary,
        content: content.body,
        sourceContainer: blobs.extracted.container,
        sourceKey: blobs.extracted.storageKey,
        updatedAt: content.updatedAt
      });
    }
    return report;
  }
}
