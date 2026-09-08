import { createHash } from "node:crypto";
import mammoth from "mammoth";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { DocumentKind } from "@proposal-factory/contracts";
import { BlobValidationError } from "./errors.js";

const allowedExtensions = new Map([
  [".txt", "text/plain"],
  [".md", "text/markdown"],
  [".markdown", "text/markdown"],
  [".docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  [".pdf", "application/pdf"]
]);

export interface PreparedDocumentContent {
  originalName: string;
  safeExtension: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  extractedText: string;
  extractionMethod: "Plain Text" | "DOCX" | "PDF";
}

export interface PrepareDocumentOptions {
  maxBytes: number;
  maxExtractedCharacters: number;
}

export interface RawDocumentUpload {
  fileName: string;
  contentType: string;
  kind: DocumentKind;
  data: Uint8Array;
}

function extension(fileName: string) {
  const dot = fileName.lastIndexOf(".");
  return dot < 0 ? "" : fileName.slice(dot).toLowerCase();
}

function validateFileName(fileName: string) {
  const name = fileName.trim();
  const hasControl = [...name].some((character) => character.charCodeAt(0) < 32);
  if (!name || name.length > 180 || hasControl || /[\\/]/.test(name) || name === "." || name === "..") {
    throw new BlobValidationError("File name is invalid.");
  }
  return name;
}

function validateSignature(data: Uint8Array, contentType: string) {
  if (contentType === "application/pdf") {
    if (new TextDecoder("ascii").decode(data.subarray(0, 5)) !== "%PDF-") {
      throw new BlobValidationError("The PDF signature is invalid.");
    }
    return;
  }
  if (contentType.includes("wordprocessingml")) {
    if (data[0] !== 0x50 || data[1] !== 0x4b || ![0x03, 0x05, 0x07].includes(data[2] ?? -1)) {
      throw new BlobValidationError("The DOCX signature is invalid.");
    }
  }
}

function cleanExtractedText(value: string, maximum: number) {
  const normalized = value
    .replaceAll("\u0000", "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
  if (!normalized) {
    throw new BlobValidationError(
      "No readable text was found. Scanned or image-only files are not supported in this release."
    );
  }
  return normalized.slice(0, maximum);
}

async function extractPdf(data: Uint8Array, maximumCharacters: number) {
  let task: ReturnType<typeof getDocument> | undefined;
  try {
    task = getDocument({
      data: data.slice(),
      disableFontFace: true,
      useSystemFonts: false
    });
    const document = await task.promise;
    if (document.numPages > 200) {
      throw new BlobValidationError("PDF files with more than 200 pages are not supported.");
    }
    const pages: string[] = [];
    let extractedCharacters = 0;
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .filter(Boolean)
        .join(" ");
      pages.push(text);
      extractedCharacters += text.length;
      page.cleanup();
      if (extractedCharacters >= maximumCharacters) break;
    }
    return pages.join("\n\n");
  } catch (error) {
    if (error instanceof BlobValidationError) throw error;
    throw new BlobValidationError(
      `The PDF could not be read as a text-based document: ${error instanceof Error ? error.message : "invalid PDF"}.`
    );
  } finally {
    await task?.destroy();
  }
}

export async function prepareDocumentContent(
  upload: RawDocumentUpload,
  options: PrepareDocumentOptions
): Promise<PreparedDocumentContent> {
  const originalName = validateFileName(upload.fileName);
  if (upload.data.byteLength === 0) throw new BlobValidationError("Empty files are not accepted.");
  if (upload.data.byteLength > options.maxBytes) {
    throw new BlobValidationError(`File exceeds the ${options.maxBytes}-byte upload limit.`);
  }
  if (options.maxExtractedCharacters < 1000) {
    throw new BlobValidationError("Extracted-text limit must be at least 1000 characters.");
  }
  const safeExtension = extension(originalName);
  const expectedType = allowedExtensions.get(safeExtension);
  if (!expectedType) {
    throw new BlobValidationError("Supported file types are TXT, Markdown, DOCX, and text-based PDF.");
  }
  const contentType = upload.contentType.toLowerCase().split(";")[0]!.trim();
  const compatibleText =
    expectedType === "text/plain" &&
    (contentType === "text/plain" || contentType === "application/octet-stream");
  const compatibleMarkdown =
    expectedType === "text/markdown" &&
    ["text/markdown", "text/plain", "application/octet-stream"].includes(contentType);
  if (contentType !== expectedType && !compatibleText && !compatibleMarkdown) {
    throw new BlobValidationError(`File extension does not match ${upload.contentType}.`);
  }
  validateSignature(upload.data, expectedType);

  let text: string;
  let extractionMethod: PreparedDocumentContent["extractionMethod"];
  if (expectedType === "text/plain" || expectedType === "text/markdown") {
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(upload.data);
    } catch {
      throw new BlobValidationError("Text files must contain valid UTF-8 text.");
    }
    if ([...text].some((character) => {
      const code = character.charCodeAt(0);
      return code < 9 || (code > 13 && code < 32);
    })) {
      throw new BlobValidationError("The text file contains unsupported binary content.");
    }
    extractionMethod = "Plain Text";
  } else if (expectedType.includes("wordprocessingml")) {
    try {
      text = (await mammoth.extractRawText({ buffer: Buffer.from(upload.data) })).value;
    } catch (error) {
      throw new BlobValidationError(
        `The DOCX file could not be read: ${error instanceof Error ? error.message : "invalid DOCX"}.`
      );
    }
    extractionMethod = "DOCX";
  } else {
    text = await extractPdf(upload.data, options.maxExtractedCharacters);
    extractionMethod = "PDF";
  }

  return {
    originalName,
    safeExtension,
    contentType: expectedType,
    sizeBytes: upload.data.byteLength,
    sha256: createHash("sha256").update(upload.data).digest("hex"),
    extractedText: cleanExtractedText(text, options.maxExtractedCharacters),
    extractionMethod
  };
}
