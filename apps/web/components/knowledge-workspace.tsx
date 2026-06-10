"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import type {
  Document,
  DocumentChunk,
  KnowledgeSearchResponse
} from "@devhub/contracts";

import {
  listDocumentChunks,
  listDocuments,
  searchKnowledge,
  uploadDocument
} from "@/lib/documents-api";

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
  const [searchResult, setSearchResult] =
    useState<KnowledgeSearchResponse | null>(null);

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
    if (!selectedDocumentId && documents[0]) {
      setSelectedDocumentId(documents[0].id);
    }
  }, [documents, selectedDocumentId]);

  const chunksQuery = useQuery({
    queryKey: ["document-chunks", activeDocumentId],
    queryFn: () => listDocumentChunks(accessToken, activeDocumentId!),
    enabled: Boolean(activeDocumentId)
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadDocument(accessToken, file),
    onSuccess: async (document) => {
      setSelectedFile(null);
      setSelectedDocumentId(document.id);
      await queryClient.invalidateQueries({ queryKey: ["documents"] });
    }
  });

  const searchMutation = useMutation({
    mutationFn: () =>
      searchKnowledge(accessToken, {
        query,
        limit: 5,
        ...(activeDocumentId ? { documentIds: [activeDocumentId] } : {})
      }),
    onSuccess: setSearchResult
  });

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

          <UploadPanel
            canManage={canManage}
            selectedFile={selectedFile}
            isUploading={uploadMutation.isPending}
            error={
              uploadMutation.error instanceof Error
                ? uploadMutation.error.message
                : null
            }
            onFileChange={setSelectedFile}
            onUpload={() => {
              if (selectedFile) {
                void uploadMutation.mutate(selectedFile);
              }
            }}
          />

          <SearchPanel
            query={query}
            result={searchResult}
            isSearching={searchMutation.isPending}
            error={
              searchMutation.error instanceof Error
                ? searchMutation.error.message
                : null
            }
            disabled={!activeDocumentId}
            onQueryChange={setQuery}
            onSearch={() => void searchMutation.mutate()}
          />

          <ChunkPreview
            chunks={chunks}
            isLoading={chunksQuery.isPending}
            document={selectedDocument}
          />
        </div>
      </div>
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

function UploadPanel({
  canManage,
  selectedFile,
  isUploading,
  error,
  onFileChange,
  onUpload
}: {
  canManage: boolean;
  selectedFile: File | null;
  isUploading: boolean;
  error: string | null;
  onFileChange(file: File | null): void;
  onUpload(): void;
}): React.JSX.Element {
  return (
    <section className="knowledge-section" aria-labelledby="upload-title">
      <div>
        <p className="section-kicker">Upload</p>
        <h3 id="upload-title">Add source material</h3>
      </div>
      <div className="upload-row">
        <label className="field">
          Document file
          <input
            type="file"
            accept=".md,.txt,.pdf,text/markdown,text/plain,application/pdf"
            disabled={!canManage || isUploading}
            onChange={(event) => {
              onFileChange(event.currentTarget.files?.[0] ?? null);
            }}
          />
          <small>
            Supported: Markdown, TXT, PDF. Uploads are tenant-scoped.
          </small>
        </label>
        <button
          className="primary-button"
          type="button"
          disabled={!canManage || !selectedFile || isUploading}
          onClick={onUpload}
        >
          Upload
        </button>
      </div>
      {!canManage ? (
        <p className="permission-note">
          Only owners and admins can upload documents.
        </p>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}

function SearchPanel({
  query,
  result,
  isSearching,
  error,
  disabled,
  onQueryChange,
  onSearch
}: {
  query: string;
  result: KnowledgeSearchResponse | null;
  isSearching: boolean;
  error: string | null;
  disabled: boolean;
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
          Search
        </button>
      </form>
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
  if (result.results.length === 0) {
    return <p className="muted">No matching chunks were found.</p>;
  }
  return (
    <ol className="knowledge-results">
      {result.results.map((item) => (
        <li key={item.chunkId}>
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
        </li>
      ))}
    </ol>
  );
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
  return (
    <section className="knowledge-section" aria-labelledby="chunks-title">
      <div>
        <p className="section-kicker">Chunks</p>
        <h3 id="chunks-title">Stored retrieval units</h3>
      </div>
      {isLoading ? (
        <div className="panel-state compact-state">
          <span className="loader" aria-hidden="true" />
          <p>Loading chunks...</p>
        </div>
      ) : !document ? (
        <p className="muted">Select or upload a document to inspect chunks.</p>
      ) : chunks.length === 0 ? (
        <p className="muted">
          No chunks yet. Current status: {document.status.toLowerCase()}.
        </p>
      ) : (
        <ol className="chunk-list">
          {chunks.slice(0, 12).map((chunk) => (
            <li key={chunk.id}>
              <span>#{chunk.ordinal}</span>
              <p>{chunk.content}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
