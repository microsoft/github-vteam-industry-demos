import JSZip from "jszip";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { BlobValidationError, prepareDocumentContent } from "../src/index.js";

const options = { maxBytes: 1024 * 1024, maxExtractedCharacters: 40_000 };

async function docx(text: string) {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8"?>
    <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
      <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
      <Default Extension="xml" ContentType="application/xml"/>
      <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
    </Types>`
  );
  zip.folder("_rels")?.file(
    ".rels",
    `<?xml version="1.0" encoding="UTF-8"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
    </Relationships>`
  );
  zip.folder("word")?.file(
    "document.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body>
    </w:document>`
  );
  return new Uint8Array(await zip.generateAsync({ type: "uint8array" }));
}

async function pdf(text: string) {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const page = document.addPage([612, 792]);
  page.drawText(text, { x: 50, y: 730, size: 12, font });
  return new Uint8Array(await document.save({ useObjectStreams: false }));
}

describe("document content validation and extraction", () => {
  it("extracts bounded UTF-8 text and Markdown", async () => {
    const text = new TextEncoder().encode("Customer requires resilient cloud delivery.");
    const result = await prepareDocumentContent(
      { fileName: "notes.md", contentType: "text/markdown", kind: "Meeting Notes", data: text },
      options
    );
    expect(result.extractedText).toContain("resilient cloud delivery");
    expect(result.extractionMethod).toBe("Plain Text");
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("extracts readable DOCX and text-based PDF content", async () => {
    const word = await prepareDocumentContent(
      {
        fileName: "requirements.docx",
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        kind: "Requirements",
        data: await docx("Customer needs automated case routing.")
      },
      options
    );
    expect(word.extractedText).toContain("automated case routing");
    expect(word.extractionMethod).toBe("DOCX");

    const portable = await prepareDocumentContent(
      {
        fileName: "requirements.pdf",
        contentType: "application/pdf",
        kind: "Requirements",
        data: await pdf("Customer needs a governed data platform.")
      },
      options
    );
    expect(portable.extractedText).toContain("governed data platform");
    expect(portable.extractionMethod).toBe("PDF");
  });

  it("rejects empty, oversized, mismatched, invalid-signature, binary, and image-only content", async () => {
    await expect(
      prepareDocumentContent(
        { fileName: "empty.txt", contentType: "text/plain", kind: "Requirements", data: new Uint8Array() },
        options
      )
    ).rejects.toBeInstanceOf(BlobValidationError);
    await expect(
      prepareDocumentContent(
        {
          fileName: "large.txt",
          contentType: "text/plain",
          kind: "Requirements",
          data: new Uint8Array(options.maxBytes + 1)
        },
        options
      )
    ).rejects.toThrow(/exceeds/);
    await expect(
      prepareDocumentContent(
        {
          fileName: "notes.pdf",
          contentType: "text/plain",
          kind: "Requirements",
          data: new TextEncoder().encode("not a pdf")
        },
        options
      )
    ).rejects.toThrow(/does not match/);
    await expect(
      prepareDocumentContent(
        {
          fileName: "notes.pdf",
          contentType: "application/pdf",
          kind: "Requirements",
          data: new TextEncoder().encode("not a pdf")
        },
        options
      )
    ).rejects.toThrow(/signature/);
    await expect(
      prepareDocumentContent(
        {
          fileName: "notes.txt",
          contentType: "text/plain",
          kind: "Requirements",
          data: new Uint8Array([0, 1, 2, 3])
        },
        options
      )
    ).rejects.toThrow(/binary|readable text/);
    await expect(
      prepareDocumentContent(
        {
          fileName: "scan.pdf",
          contentType: "application/pdf",
          kind: "Requirements",
          data: await pdf("")
        },
        options
      )
    ).rejects.toThrow(/No readable text/);
  });
});
