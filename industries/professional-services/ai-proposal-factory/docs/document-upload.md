# Document Upload

AI Proposal Factory accepts real customer meeting notes and requirements documents through `multipart/form-data`.

## Supported formats

| Extension | Accepted MIME type | Extraction |
|---|---|---|
| `.txt` | `text/plain` | Strict UTF-8 |
| `.md`, `.markdown` | `text/markdown` or `text/plain` | Strict UTF-8 |
| `.docx` | Office Open XML document | Mammoth raw-text extraction |
| `.pdf` | `application/pdf` | PDF.js text extraction |

PDF and DOCX signatures are checked before parsing. Empty files, binary text, invalid archives, malformed PDFs, image-only/scanned PDFs, MIME/extension mismatches, unsupported types, and files over the configured limit are rejected. OCR is intentionally not implied.

## Configuration

```text
DOCUMENT_UPLOAD_MAX_BYTES=10485760
DOCUMENT_EXTRACTED_TEXT_MAX_CHARACTERS=40000
LOCAL_UPLOAD_DIRECTORY=.data/uploads
AZURE_BLOB_UPLOADS_CONTAINER=uploaded-documents
```

The default upload limit is 10 MiB. Extracted text is capped at 40,000 characters before it enters proposal-generation input. Raising either value requires reviewing API memory, model context, and document sensitivity.

## Storage behavior

### Local

Original bytes are stored beneath:

```text
<LOCAL_UPLOAD_DIRECTORY>/<opportunity-id>/<document-id>/<document-id>.<validated-extension>
```

User-provided names are retained only as display metadata. Storage paths use server-generated IDs and are constrained to the configured root.

### Azure

Original bytes are stored in the private `uploaded-documents` Blob container using the same opportunity/document path convention. The managed identity requires **Storage Blob Data Contributor**. No account key, SAS token, or public URL is returned.

## Consistency and cleanup

1. Validate type, signature, size, and extractable text.
2. Store original bytes.
3. Persist document metadata and bounded extracted text.
4. Add an audit event.
5. The UI selects the successful upload for generation.

If metadata persistence fails, the API attempts to delete the stored object. If cleanup also fails, the request fails with the internal storage key in the server error so operators can remove the orphan; it never returns a successful upload response.

Uploaded text is included in the immutable generation job snapshot. The short UI summary remains concise, while requirements analysis receives the bounded extracted content.
