"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";

import type {
  Document,
  DocumentChunk,
  KnowledgeSearchResult,
  KnowledgeSearchResponse
} from "@devhub/contracts";

import {
  deleteDocument,
  listDocumentChunks,
  listDocuments,
  reindexDocument,
  streamKnowledgeSearch,
  uploadDocument
} from "@/lib/documents-api";
import { ApiClientError } from "@/lib/api-client";

const chunkPreviewPageSize = 5;
const retrievalSourceLimit = 3;

interface KnowledgeWorkspaceProps {
  accessToken: string;
  canManage: boolean;
}

export function KnowledgeWorkspace({
  accessToken,
  canManage
}: KnowledgeWorkspaceProps): React.JSX.Element {
  const queryClient = useQueryClient();
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(
    null
  );
  const [query, setQuery] = useState("What does this knowledge base contain?");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [searchResult, setSearchResult] =
    useState<KnowledgeSearchResponse | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const searchAbortController = useRef<AbortController | null>(null);

  const documentsQuery = useQuery({
    queryKey: ["documents"],
    queryFn: () => listDocuments(accessToken),
    refetchInterval: (queryState) =>
      (queryState.state.data ?? []).some((document) =>
        ["UPLOADED", "PROCESSING"].includes(document.status)
      )
        ? 2500
        : false
  });
  const documents = documentsQuery.data ?? [];
  const selectedDocument =
    documents.find((document) => document.id === selectedDocumentId) ??
    documents[0] ??
    null;
  const activeDocumentId = selectedDocument?.id ?? null;

  useEffect(() => {
    if (
      selectedDocumentId &&
      documents.some((item) => item.id === selectedDocumentId)
    ) {
      return;
    }
    if (documents[0]) {
      setSelectedDocumentId(documents[0].id);
      return;
    }
    if (selectedDocumentId) {
      setSelectedDocumentId(null);
    }
  }, [documents, selectedDocumentId]);

  const chunksQuery = useQuery({
    queryKey: ["document-chunks", activeDocumentId],
    queryFn: () => listDocumentChunks(accessToken, activeDocumentId!),
    enabled: Boolean(activeDocumentId),
    refetchInterval:
      selectedDocument?.status === "UPLOADED" ||
      selectedDocument?.status === "PROCESSING"
        ? 2500
        : false
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadDocument(accessToken, file),
    onSuccess: async (document) => {
      setSelectedFile(null);
      setSelectedDocumentId(document.id);
      setSearchResult(null);
      setIsUploadDialogOpen(true);
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ["documents"] });
    }
  });

  const reindexMutation = useMutation({
    mutationFn: (documentId: string) =>
      reindexDocument(accessToken, documentId),
    onSuccess: async (document) => {
      setSelectedDocumentId(document.id);
      setSearchResult(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["documents"] }),
        queryClient.invalidateQueries({
          queryKey: ["document-chunks", document.id]
        })
      ]);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (documentId: string) => deleteDocument(accessToken, documentId),
    onSuccess: async (_result, documentId) => {
      setSearchResult(null);
      setSelectedDocumentId((current) =>
        current === documentId ? null : current
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["documents"] }),
        queryClient.removeQueries({ queryKey: ["document-chunks", documentId] })
      ]);
    }
  });

  useEffect(
    () => () => {
      searchAbortController.current?.abort();
    },
    []
  );

  const runSearch = async (): Promise<void> => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery || !activeDocumentId || isSearching) {
      return;
    }

    searchAbortController.current?.abort();
    const controller = new AbortController();
    searchAbortController.current = controller;
    setSearchError(null);
    setIsSearching(true);
    setSearchResult({
      query: trimmedQuery,
      answer: "",
      results: []
    });
    try {
      await streamKnowledgeSearch(
        accessToken,
        {
          query: trimmedQuery,
          limit: retrievalSourceLimit,
          documentIds: [activeDocumentId]
        },
        (event) => {
          if (event.type === "knowledge.search.started") {
            setSearchResult({
              query: event.query,
              answer: "",
              results: event.results
            });
          } else if (event.type === "knowledge.search.delta") {
            setSearchResult((current) => ({
              query: current?.query ?? trimmedQuery,
              answer: `${current?.answer ?? ""}${event.text}`,
              results: current?.results ?? []
            }));
          } else if (event.type === "knowledge.search.completed") {
            setSearchResult((current) => ({
              query: current?.query ?? trimmedQuery,
              answer: event.answer,
              results: current?.results ?? []
            }));
          } else {
            setSearchError(`${event.code}: ${event.message}`);
          }
        },
        controller.signal
      );
    } catch (caught) {
      if (!controller.signal.aborted) {
        setSearchError(
          caught instanceof Error ? formatError(caught) : "Search failed."
        );
      }
    } finally {
      if (searchAbortController.current === controller) {
        searchAbortController.current = null;
      }
      setIsSearching(false);
    }
  };

  const chunks = useMemo(
    () =>
      (chunksQuery.data ?? []).toSorted(
        (left, right) => left.ordinal - right.ordinal
      ),
    [chunksQuery.data]
  );

  return (
    <section
      className="workspace"
      id="knowledge"
      aria-labelledby="knowledge-title"
    >
      <div className="workspace-heading">
        <div>
          <p className="section-kicker">Knowledge base</p>
          <h1 id="knowledge-title">Feed the system trustworthy context.</h1>
          <p>
            Upload documents, watch ingestion status, inspect chunks, and test
            retrieval before wiring knowledge into agents or workflows.
          </p>
        </div>
        <div className="environment-badge">
          <span className="status-dot" aria-hidden="true" />
          RAG ready
        </div>
      </div>

      <div className="workspace-grid">
        <aside className="agent-list-panel">
          <div className="panel-heading">
            <div>
              <p className="section-kicker">Documents</p>
              <h2>Indexed sources</h2>
            </div>
            <button
              className="icon-button"
              type="button"
              title="Add document"
              aria-label="Add document"
              disabled={!canManage || uploadMutation.isPending}
              onClick={() => {
                uploadMutation.reset();
                setSelectedFile(null);
                setIsUploadDialogOpen(true);
              }}
            >
              +
            </button>
          </div>
          <DocumentList
            documents={documents}
            isLoading={documentsQuery.isPending}
            isError={documentsQuery.isError}
            selectedId={activeDocumentId}
            onRetry={() => void documentsQuery.refetch()}
            onSelect={setSelectedDocumentId}
          />
        </aside>

        <div className="editor-panel">
          <div className="panel-heading editor-heading">
            <div>
              <p className="section-kicker">Source control</p>
              <h2>{selectedDocument?.fileName ?? "No document selected"}</h2>
            </div>
            {selectedDocument ? (
              <span
                className={`status-pill ${selectedDocument.status.toLowerCase()}`}
              >
                {selectedDocument.status.toLowerCase()}
              </span>
            ) : null}
          </div>

          <DocumentActions
            canManage={canManage}
            document={selectedDocument}
            isRetrying={reindexMutation.isPending}
            isDeleting={deleteMutation.isPending}
            retryError={
              reindexMutation.error instanceof Error
                ? formatError(reindexMutation.error)
                : null
            }
            deleteError={
              deleteMutation.error instanceof Error
                ? formatError(deleteMutation.error)
                : null
            }
            onRetry={(documentId) => void reindexMutation.mutate(documentId)}
            onDelete={(documentId) => void deleteMutation.mutate(documentId)}
          />

          <SearchPanel
            query={query}
            result={searchResult}
            isSearching={isSearching}
            error={searchError}
            disabled={selectedDocument?.status !== "INDEXED"}
            disabledReason={searchDisabledReason(selectedDocument)}
            onQueryChange={setQuery}
            onSearch={() => void runSearch()}
          />

          <ChunkPreview
            chunks={chunks}
            isLoading={chunksQuery.isPending}
            document={selectedDocument}
          />
        </div>
      </div>

      {isUploadDialogOpen ? (
        <UploadDialog
          canManage={canManage}
          selectedFile={selectedFile}
          isUploading={uploadMutation.isPending}
          error={
            uploadMutation.error instanceof Error
              ? formatError(uploadMutation.error)
              : null
          }
          uploadedDocument={uploadMutation.data ?? null}
          onFileChange={setSelectedFile}
          onUpload={() => {
            if (selectedFile) {
              void uploadMutation.mutate(selectedFile);
            }
          }}
          onClose={() => {
            if (!uploadMutation.isPending) {
              setIsUploadDialogOpen(false);
            }
          }}
        />
      ) : null}
    </section>
  );
}

function DocumentList({
  documents,
  isLoading,
  isError,
  selectedId,
  onRetry,
  onSelect
}: {
  documents: readonly Document[];
  isLoading: boolean;
  isError: boolean;
  selectedId: string | null;
  onRetry(): void;
  onSelect(documentId: string): void;
}): React.JSX.Element {
  if (isLoading) {
    return (
      <div className="panel-state">
        <span className="loader" aria-hidden="true" />
        <p>Loading documents...</p>
      </div>
    );
  }
  if (isError) {
    return (
      <div className="panel-state">
        <p>Documents could not be loaded.</p>
        <button className="secondary-button" type="button" onClick={onRetry}>
          Try again
        </button>
      </div>
    );
  }
  if (documents.length === 0) {
    return (
      <div className="panel-state">
        <p>No documents yet.</p>
        <span>
          Upload Markdown, text, or PDF files to create searchable context.
        </span>
      </div>
    );
  }
  return (
    <ul className="agent-list">
      {documents.map((document) => (
        <li key={document.id}>
          <button
            className={document.id === selectedId ? "selected" : ""}
            type="button"
            onClick={() => onSelect(document.id)}
          >
            <span className="agent-avatar" aria-hidden="true">
              {document.fileName.charAt(0).toUpperCase()}
            </span>
            <span>
              <strong>{document.fileName}</strong>
              <small>
                {document.status.toLowerCase()} / {document.chunkCount} chunks
              </small>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function UploadDialog({
  canManage,
  selectedFile,
  isUploading,
  error,
  uploadedDocument,
  onFileChange,
  onUpload,
  onClose
}: {
  canManage: boolean;
  selectedFile: File | null;
  isUploading: boolean;
  error: string | null;
  uploadedDocument: Document | null;
  onFileChange(file: File | null): void;
  onUpload(): void;
  onClose(): void;
}): React.JSX.Element {
  const uploadState = uploadStatus(selectedFile, isUploading, uploadedDocument);
  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="upload-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="upload-title"
      >
        <div className="modal-heading">
          <div>
            <p className="section-kicker">New document</p>
            <h3 id="upload-title">Add source material</h3>
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label="Close upload dialog"
            disabled={isUploading}
            onClick={onClose}
          >
            x
          </button>
        </div>

        <div className={`upload-status ${uploadState.kind}`}>
          {uploadState.kind === "uploading" ? (
            <span className="loader" aria-hidden="true" />
          ) : null}
          <div>
            <strong>{uploadState.title}</strong>
            <p>{uploadState.detail}</p>
          </div>
        </div>

        <div className="upload-row">
          <label className="field">
            Document file
            <input
              type="file"
              accept=".md,.txt,.pdf,.jpg,.jpeg,.png,.webp,text/markdown,text/plain,application/pdf,image/jpeg,image/png,image/webp"
              disabled={!canManage || isUploading}
              onChange={(event) => {
                onFileChange(event.currentTarget.files?.[0] ?? null);
              }}
            />
            <small>
              Supported: Markdown, TXT, PDF, JPEG, PNG, WebP. Uploads are
              tenant-scoped.
            </small>
          </label>
          <button
            className="primary-button"
            type="button"
            disabled={!canManage || !selectedFile || isUploading}
            onClick={onUpload}
          >
            {isUploading ? "Uploading..." : "Upload"}
          </button>
        </div>
        {!canManage ? (
          <p className="permission-note">
            Only owners and admins can upload documents.
          </p>
        ) : null}
        {error ? <p role="alert">{error}</p> : null}
      </section>
    </div>
  );
}

function uploadStatus(
  selectedFile: File | null,
  isUploading: boolean,
  uploadedDocument: Document | null
): {
  kind: "idle" | "selected" | "uploading" | "queued";
  title: string;
  detail: string;
} {
  if (isUploading) {
    return {
      kind: "uploading",
      title: "Uploading and queueing ingestion",
      detail: selectedFile
        ? `${selectedFile.name} is being stored and sent to the worker queue.`
        : "The document is being stored and sent to the worker queue."
    };
  }
  if (uploadedDocument) {
    return {
      kind: "queued",
      title: "Document queued",
      detail: `${uploadedDocument.fileName} is ready for worker ingestion. Keep the worker running until status becomes indexed.`
    };
  }
  if (selectedFile) {
    return {
      kind: "selected",
      title: "File selected",
      detail: `${selectedFile.name} is ready to upload.`
    };
  }
  return {
    kind: "idle",
    title: "Choose a file",
    detail:
      "Pick a Markdown, TXT, PDF, JPEG, PNG, or WebP document to add it to Knowledge."
  };
}

function DocumentActions({
  canManage,
  document,
  isRetrying,
  isDeleting,
  retryError,
  deleteError,
  onRetry,
  onDelete
}: {
  canManage: boolean;
  document: Document | null;
  isRetrying: boolean;
  isDeleting: boolean;
  retryError: string | null;
  deleteError: string | null;
  onRetry(documentId: string): void;
  onDelete(documentId: string): void;
}): React.JSX.Element {
  const busy = isRetrying || isDeleting;
  return (
    <section
      className="knowledge-section"
      aria-labelledby="document-actions-title"
    >
      <div className="action-heading">
        <div>
          <p className="section-kicker">Document actions</p>
          <h3 id="document-actions-title">Repair or remove source</h3>
        </div>
        <div className="action-row">
          <button
            className="secondary-button"
            type="button"
            disabled={!canManage || !document || busy}
            onClick={() => {
              if (document) {
                onRetry(document.id);
              }
            }}
          >
            {isRetrying ? "Queueing..." : "Retry ingestion"}
          </button>
          <button
            className="danger-button"
            type="button"
            disabled={!canManage || !document || busy}
            onClick={() => {
              if (document && window.confirm(`Delete ${document.fileName}?`)) {
                onDelete(document.id);
              }
            }}
          >
            {isDeleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
      {!document ? (
        <p className="muted">Select a document before running actions.</p>
      ) : (
        <p className="muted">
          Retry queues parsing, chunking, embeddings, and vector replacement for
          the selected document.
        </p>
      )}
      {!canManage ? (
        <p className="permission-note">
          Only owners and admins can retry or delete documents.
        </p>
      ) : null}
      {retryError ? <p role="alert">{retryError}</p> : null}
      {deleteError ? <p role="alert">{deleteError}</p> : null}
    </section>
  );
}

function SearchPanel({
  query,
  result,
  isSearching,
  error,
  disabled,
  disabledReason,
  onQueryChange,
  onSearch
}: {
  query: string;
  result: KnowledgeSearchResponse | null;
  isSearching: boolean;
  error: string | null;
  disabled: boolean;
  disabledReason: string;
  onQueryChange(query: string): void;
  onSearch(): void;
}): React.JSX.Element {
  return (
    <section className="knowledge-section" aria-labelledby="search-title">
      <div>
        <p className="section-kicker">Retrieval test</p>
        <h3 id="search-title">Ask the knowledge base</h3>
      </div>
      <form
        className="knowledge-search"
        onSubmit={(event) => {
          event.preventDefault();
          onSearch();
        }}
      >
        <label className="field">
          Query
          <textarea
            value={query}
            rows={3}
            disabled={disabled || isSearching}
            onChange={(event) => onQueryChange(event.target.value)}
          />
        </label>
        <button
          className="primary-button"
          type="submit"
          disabled={disabled || !query.trim() || isSearching}
        >
          {isSearching ? "Answering..." : "Search"}
        </button>
      </form>
      {disabled ? <p className="muted">{disabledReason}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      {result ? <SearchResults result={result} /> : null}
    </section>
  );
}

function SearchResults({
  result
}: {
  result: KnowledgeSearchResponse;
}): React.JSX.Element {
  return (
    <div className="knowledge-answer">
      <div>
        <p className="section-kicker">Answer</p>
        {result.answer ? (
          <MarkdownAnswer content={result.answer} />
        ) : (
          <p className="muted">Waiting for the model...</p>
        )}
      </div>
      {result.results.length === 0 ? (
        <p className="muted">No matching chunks were found.</p>
      ) : (
        <CitationSources results={result.results} />
      )}
    </div>
  );
}

function CitationSources({
  results
}: {
  results: readonly KnowledgeSearchResult[];
}): React.JSX.Element {
  return (
    <div className="citation-sources" aria-label="Retrieved sources">
      {results.map((item, index) => (
        <div className="citation-source" key={item.chunkId}>
          <button
            className="citation-bubble"
            type="button"
            aria-label={`${item.citationLabel}, ${item.fileName}`}
          >
            {index + 1}
          </button>
          <div className="citation-popover" role="tooltip">
            <div>
              <strong>{item.citationLabel}</strong>
              <span>{Math.round(item.score * 100)} score</span>
            </div>
            <p>{item.content}</p>
            <small>
              {item.fileName}
              {item.pageNumber ? ` / page ${item.pageNumber}` : ""} / chunk{" "}
              {item.ordinal}
            </small>
          </div>
        </div>
      ))}
    </div>
  );
}

function MarkdownAnswer({ content }: { content: string }): React.JSX.Element {
  const blocks = toMarkdownBlocks(content);
  return (
    <div className="markdown-answer">
      {blocks.map((block, index) => {
        if (block.kind === "heading") {
          const HeadingTag = `h${block.level}` as const;
          return (
            <HeadingTag key={index}>
              {renderInlineMarkdown(block.content)}
            </HeadingTag>
          );
        }
        if (block.kind === "code") {
          return (
            <pre key={index}>
              <code>{block.content}</code>
            </pre>
          );
        }
        if (block.kind === "list") {
          const ListTag = block.ordered ? "ol" : "ul";
          return (
            <ListTag key={index}>
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>{renderInlineMarkdown(item)}</li>
              ))}
            </ListTag>
          );
        }
        if (block.kind === "quote") {
          return (
            <blockquote key={index}>
              {renderInlineMarkdown(block.content)}
            </blockquote>
          );
        }
        return <p key={index}>{renderInlineMarkdown(block.content)}</p>;
      })}
    </div>
  );
}

function renderInlineMarkdown(content: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(content)) !== null) {
    if (match.index > cursor) {
      nodes.push(content.slice(cursor, match.index));
    }
    const token = match[0];
    const key = `${match.index}-${token}`;
    if (token.startsWith("**") && token.endsWith("**")) {
      nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("*") && token.endsWith("*")) {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    } else if (token.startsWith("`") && token.endsWith("`")) {
      nodes.push(<code key={key}>{token.slice(1, -1)}</code>);
    } else {
      const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (link) {
        nodes.push(
          <a key={key} href={link[2] ?? "#"} rel="noreferrer" target="_blank">
            {link[1] ?? ""}
          </a>
        );
      } else {
        nodes.push(token);
      }
    }
    cursor = match.index + token.length;
  }

  if (cursor < content.length) {
    nodes.push(content.slice(cursor));
  }
  return nodes;
}

type MarkdownBlock =
  | { kind: "heading"; level: 2 | 3 | 4; content: string }
  | { kind: "paragraph"; content: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "quote"; content: string }
  | { kind: "code"; content: string };

function toMarkdownBlocks(content: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const lines = content.split(/\r?\n/);
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let quote: string[] = [];
  let code: string[] | null = null;

  const flushParagraph = (): void => {
    if (paragraph.length > 0) {
      blocks.push({ kind: "paragraph", content: paragraph.join(" ") });
      paragraph = [];
    }
  };
  const flushList = (): void => {
    if (list) {
      blocks.push({ kind: "list", ordered: list.ordered, items: list.items });
      list = null;
    }
  };
  const flushQuote = (): void => {
    if (quote.length > 0) {
      blocks.push({ kind: "quote", content: quote.join(" ") });
      quote = [];
    }
  };
  const flushTextBlocks = (): void => {
    flushParagraph();
    flushList();
    flushQuote();
  };

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      if (code) {
        blocks.push({ kind: "code", content: code.join("\n") });
        code = null;
      } else {
        flushTextBlocks();
        code = [];
      }
      continue;
    }
    if (code) {
      code.push(line);
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushTextBlocks();
      blocks.push({
        kind: "heading",
        level: Math.min(Math.max(heading[1]?.length ?? 2, 2), 4) as 2 | 3 | 4,
        content: heading[2] ?? ""
      });
      continue;
    }

    const quoteMatch = line.match(/^\s*>\s+(.+)$/);
    if (quoteMatch) {
      flushParagraph();
      flushList();
      quote.push(quoteMatch[1] ?? "");
      continue;
    }

    const unorderedListMatch = line.match(/^\s*[-*]\s+(.+)$/);
    const orderedListMatch = line.match(/^\s*\d+\.\s+(.+)$/);
    if (unorderedListMatch || orderedListMatch) {
      flushParagraph();
      flushQuote();
      const ordered = Boolean(orderedListMatch);
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { ordered, items: [] };
      }
      list.items.push(orderedListMatch?.[1] ?? unorderedListMatch?.[1] ?? "");
      continue;
    }

    if (!line.trim()) {
      flushTextBlocks();
      continue;
    }
    flushList();
    flushQuote();
    paragraph.push(line.trim());
  }

  if (code) {
    blocks.push({ kind: "code", content: code.join("\n") });
  }
  flushTextBlocks();
  return blocks;
}

function ChunkPreview({
  chunks,
  isLoading,
  document
}: {
  chunks: readonly DocumentChunk[];
  isLoading: boolean;
  document: Document | null;
}): React.JSX.Element {
  const [pageIndex, setPageIndex] = useState(0);
  const pageCount = Math.max(
    1,
    Math.ceil(chunks.length / chunkPreviewPageSize)
  );
  const safePageIndex = Math.min(pageIndex, pageCount - 1);
  const visibleChunks = chunks.slice(
    safePageIndex * chunkPreviewPageSize,
    safePageIndex * chunkPreviewPageSize + chunkPreviewPageSize
  );

  useEffect(() => {
    setPageIndex(0);
  }, [document?.id, chunks.length]);

  return (
    <section className="knowledge-section" aria-labelledby="chunks-title">
      <div className="chunk-heading">
        <div>
          <p className="section-kicker">Chunks</p>
          <h3 id="chunks-title">Stored retrieval units</h3>
        </div>
        {chunks.length > 0 ? (
          <span>
            {safePageIndex * chunkPreviewPageSize + 1}-
            {Math.min(
              safePageIndex * chunkPreviewPageSize + visibleChunks.length,
              chunks.length
            )}{" "}
            of {chunks.length}
          </span>
        ) : null}
      </div>
      {isLoading ? (
        <div className="panel-state compact-state">
          <span className="loader" aria-hidden="true" />
          <p>Loading chunks...</p>
        </div>
      ) : !document ? (
        <p className="muted">Select or upload a document to inspect chunks.</p>
      ) : document.status === "FAILED" ? (
        <p className="muted">
          Ingestion failed: {document.failureDetail ?? document.failureCode}.
        </p>
      ) : chunks.length === 0 ? (
        <p className="muted">
          No chunks yet. Current status: {document.status.toLowerCase()}.
        </p>
      ) : (
        <>
          <ol className="chunk-list">
            {visibleChunks.map((chunk) => (
              <li key={chunk.id}>
                <span>#{chunk.ordinal}</span>
                <p>{chunk.content}</p>
              </li>
            ))}
          </ol>
          <div className="chunk-pagination" aria-label="Chunk pagination">
            <button
              className="secondary-button"
              type="button"
              disabled={safePageIndex === 0}
              onClick={() =>
                setPageIndex((current) => Math.max(0, current - 1))
              }
            >
              Previous
            </button>
            <span>
              Page {safePageIndex + 1} of {pageCount}
            </span>
            <button
              className="secondary-button"
              type="button"
              disabled={safePageIndex >= pageCount - 1}
              onClick={() =>
                setPageIndex((current) => Math.min(pageCount - 1, current + 1))
              }
            >
              Next
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function searchDisabledReason(document: Document | null): string {
  if (!document) {
    return "Upload and select an indexed document before testing retrieval.";
  }
  if (document.status === "FAILED") {
    return `This document failed ingestion: ${
      document.failureDetail ?? document.failureCode ?? "unknown failure"
    }.`;
  }
  return `Retrieval is available after ingestion reaches indexed. Current status: ${document.status.toLowerCase()}.`;
}

function formatError(error: Error): string {
  if (error instanceof ApiClientError) {
    return `${error.response.message} [${error.response.code}, correlation: ${error.response.correlationId}]`;
  }
  return error.message;
}
