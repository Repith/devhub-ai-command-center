"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import type { GmailDraftReview } from "@devhub/contracts";

import {
  connectGmail,
  getGmailStatus,
  listGmailDraftReviews,
  rejectGmailDraftReview,
  sendGmailDraftReview,
  updateGmailDraftReview
} from "@/lib/gmail-api";

interface GmailWorkspaceProps {
  accessToken: string;
}

export function GmailWorkspace({
  accessToken
}: GmailWorkspaceProps): React.JSX.Element {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const statusQuery = useQuery({
    queryKey: ["gmail-status"],
    queryFn: () => getGmailStatus(accessToken)
  });
  const reviewsQuery = useQuery({
    queryKey: ["gmail-draft-reviews"],
    queryFn: () => listGmailDraftReviews(accessToken)
  });
  const reviews = reviewsQuery.data ?? [];
  const pendingReviews = reviews.filter((review) =>
    ["NEEDS_REVIEW", "UPDATED"].includes(review.status)
  );
  const selectedReview =
    reviews.find((review) => review.id === selectedId) ??
    pendingReviews[0] ??
    reviews[0] ??
    null;

  const connectMutation = useMutation({
    mutationFn: () => connectGmail(accessToken),
    onSuccess: (response) => {
      window.location.assign(response.authorizationUrl);
    }
  });

  const saveMutation = useMutation({
    mutationFn: (input: DraftFormState) =>
      updateGmailDraftReview(accessToken, selectedReview!.id, {
        to: splitRecipients(input.to),
        cc: splitRecipients(input.cc),
        subject: input.subject,
        body: input.body
      }),
    onSuccess: async (review) => {
      setSelectedId(review.id);
      await queryClient.invalidateQueries({
        queryKey: ["gmail-draft-reviews"]
      });
    }
  });

  const sendMutation = useMutation({
    mutationFn: () => sendGmailDraftReview(accessToken, selectedReview!.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["gmail-draft-reviews"]
      });
    }
  });

  const rejectMutation = useMutation({
    mutationFn: () => rejectGmailDraftReview(accessToken, selectedReview!.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["gmail-draft-reviews"]
      });
    }
  });

  return (
    <section className="workspace" id="gmail" aria-labelledby="gmail-title">
      <div className="workspace-heading">
        <div>
          <p className="section-kicker">Gmail review</p>
          <h1 id="gmail-title">Approve mail before anything leaves.</h1>
          <p>
            Agents can prepare drafts, but the authenticated user reviews
            recipients, subject, and body before the API sends the message.
          </p>
        </div>
        <div className="workspace-actions">
          <ConnectionStatus
            status={statusQuery.data?.status ?? "DISCONNECTED"}
            accountEmail={statusQuery.data?.accountEmail ?? null}
          />
          {statusQuery.data?.status === "DISCONNECTED" ||
          statusQuery.data?.status === "MISCONFIGURED" ? (
            <button
              className="secondary-button"
              type="button"
              disabled={
                connectMutation.isPending ||
                statusQuery.data.status === "MISCONFIGURED"
              }
              onClick={() => void connectMutation.mutateAsync()}
            >
              Connect Gmail
            </button>
          ) : null}
        </div>
      </div>

      {connectMutation.error ? (
        <p className="workspace-alert" role="alert">
          {connectMutation.error instanceof Error
            ? connectMutation.error.message
            : "Gmail connection failed."}
        </p>
      ) : null}

      <div className="gmail-grid">
        <DraftReviewList
          reviews={reviews}
          selectedId={selectedReview?.id ?? null}
          isLoading={reviewsQuery.isPending}
          isError={reviewsQuery.isError}
          onSelect={setSelectedId}
          onRetry={() => void reviewsQuery.refetch()}
        />
        <DraftReviewEditor
          review={selectedReview}
          connectionReady={statusQuery.data?.status === "CONNECTED"}
          isSaving={saveMutation.isPending}
          isSending={sendMutation.isPending}
          isRejecting={rejectMutation.isPending}
          error={
            saveMutation.error instanceof Error
              ? saveMutation.error.message
              : sendMutation.error instanceof Error
                ? sendMutation.error.message
                : rejectMutation.error instanceof Error
                  ? rejectMutation.error.message
                  : null
          }
          onSave={(input) => saveMutation.mutateAsync(input)}
          onSend={() => sendMutation.mutateAsync()}
          onReject={() => rejectMutation.mutateAsync()}
        />
      </div>
    </section>
  );
}

interface ConnectionStatusProps {
  status: string;
  accountEmail: string | null;
}

function ConnectionStatus({
  status,
  accountEmail
}: ConnectionStatusProps): React.JSX.Element {
  const tone = status === "CONNECTED" ? "connected" : "error";
  return (
    <div className="connection-card compact">
      <span className={`connection-indicator ${tone}`} aria-hidden="true" />
      <div>
        <strong>{status.replace("_", " ").toLowerCase()}</strong>
        <span>{accountEmail ?? "Gmail OAuth"}</span>
      </div>
    </div>
  );
}

interface DraftReviewListProps {
  reviews: readonly GmailDraftReview[];
  selectedId: string | null;
  isLoading: boolean;
  isError: boolean;
  onSelect(reviewId: string): void;
  onRetry(): void;
}

function DraftReviewList({
  reviews,
  selectedId,
  isLoading,
  isError,
  onSelect,
  onRetry
}: DraftReviewListProps): React.JSX.Element {
  if (isLoading) {
    return (
      <aside className="agent-list-panel panel-state">
        <div className="loader" aria-hidden="true" />
        <p>Loading draft queue</p>
      </aside>
    );
  }
  if (isError) {
    return (
      <aside className="agent-list-panel panel-state" role="alert">
        <p>Draft queue failed to load.</p>
        <button className="secondary-button" type="button" onClick={onRetry}>
          Retry
        </button>
      </aside>
    );
  }
  if (reviews.length === 0) {
    return (
      <aside className="agent-list-panel panel-state">
        <div className="empty-orbit" aria-hidden="true">
          <span>@</span>
        </div>
        <p>No draft reviews yet.</p>
        <span>Gmail Reply Assistant drafts will appear here.</span>
      </aside>
    );
  }
  return (
    <aside className="agent-list-panel">
      <div className="panel-heading">
        <h2>Review queue</h2>
      </div>
      <ol className="gmail-review-list">
        {reviews.map((review) => (
          <li key={review.id}>
            <button
              className={review.id === selectedId ? "selected" : ""}
              type="button"
              onClick={() => onSelect(review.id)}
            >
              <span className={`status-pill ${review.status.toLowerCase()}`}>
                {review.status.replace("_", " ")}
              </span>
              <strong>{review.subject}</strong>
              <small>{review.to.join(", ")}</small>
            </button>
          </li>
        ))}
      </ol>
    </aside>
  );
}

interface DraftReviewEditorProps {
  review: GmailDraftReview | null;
  connectionReady: boolean;
  isSaving: boolean;
  isSending: boolean;
  isRejecting: boolean;
  error: string | null;
  onSave(input: DraftFormState): Promise<GmailDraftReview>;
  onSend(): Promise<GmailDraftReview>;
  onReject(): Promise<GmailDraftReview>;
}

interface DraftFormState {
  to: string;
  cc: string;
  subject: string;
  body: string;
}

function DraftReviewEditor({
  review,
  connectionReady,
  isSaving,
  isSending,
  isRejecting,
  error,
  onSave,
  onSend,
  onReject
}: DraftReviewEditorProps): React.JSX.Element {
  const initialState = useMemo(() => toFormState(review), [review]);
  const [form, setForm] = useState<DraftFormState>(initialState);
  const editable =
    review !== null && ["NEEDS_REVIEW", "UPDATED"].includes(review.status);

  useEffect(() => {
    setForm(initialState);
  }, [initialState]);

  if (!review) {
    return (
      <section className="editor-panel panel-state">
        <p>Select a draft review.</p>
        <span>Prepared Gmail replies will open here for approval.</span>
      </section>
    );
  }

  return (
    <section className="editor-panel">
      <div className="panel-heading editor-heading">
        <div>
          <h2>Draft approval</h2>
          <span className="saved-state">{review.status.replace("_", " ")}</span>
        </div>
      </div>
      <form
        className="agent-form"
        onSubmit={(event) => {
          event.preventDefault();
          void onSave(form);
        }}
      >
        <fieldset disabled={!editable || isSaving || isSending || isRejecting}>
          <label className="field">
            To
            <input
              value={form.to}
              onChange={(event) =>
                setForm({ ...form, to: event.currentTarget.value })
              }
            />
          </label>
          <label className="field">
            Cc
            <input
              value={form.cc}
              onChange={(event) =>
                setForm({ ...form, cc: event.currentTarget.value })
              }
            />
          </label>
          <label className="field">
            Subject
            <input
              value={form.subject}
              onChange={(event) =>
                setForm({ ...form, subject: event.currentTarget.value })
              }
            />
          </label>
          <label className="field">
            Body
            <textarea
              rows={16}
              value={form.body}
              onChange={(event) =>
                setForm({ ...form, body: event.currentTarget.value })
              }
            />
          </label>
        </fieldset>
        {error ? (
          <p className="workspace-alert" role="alert">
            {error}
          </p>
        ) : null}
        <div className="form-actions">
          <button
            className="danger-button"
            type="button"
            disabled={!editable || isRejecting}
            onClick={() => void onReject()}
          >
            Reject
          </button>
          <button
            className="secondary-button"
            type="submit"
            disabled={!editable}
          >
            Save changes
          </button>
          <button
            className="primary-button"
            type="button"
            disabled={!editable || !connectionReady || isSending}
            onClick={() => void onSend()}
          >
            Send
          </button>
        </div>
      </form>
    </section>
  );
}

function toFormState(review: GmailDraftReview | null): DraftFormState {
  return {
    to: review?.to.join(", ") ?? "",
    cc: review?.cc.join(", ") ?? "",
    subject: review?.subject ?? "",
    body: review?.body ?? ""
  };
}

function splitRecipients(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
