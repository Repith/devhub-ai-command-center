"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { useEffect, useState } from "react";
import type { z } from "zod";

import {
  createAgentDefinitionSchema,
  type AgentDefinition,
  type CreateAgentDefinition
} from "@devhub/contracts";

interface AgentFormProps {
  agent: AgentDefinition | null;
  canManage: boolean;
  isNew: boolean;
  isSaving: boolean;
  isDeleting: boolean;
  saveError: string | null;
  onSave(input: CreateAgentDefinition): Promise<unknown>;
  onDelete?: (() => Promise<unknown>) | undefined;
  onCancel(): void;
}

const EMPTY_AGENT: CreateAgentDefinition = {
  name: "",
  description: "",
  provider: "ollama",
  model: "qwen3:8b",
  systemPrompt:
    "You are a precise assistant. Use only authorized tools and knowledge.",
  maxSteps: 8,
  maxToolCalls: 4,
  timeoutMs: 120_000,
  enabledToolIds: [],
  knowledgeBaseIds: []
};

type AgentFormInput = z.input<typeof createAgentDefinitionSchema>;
const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium"
});

export function AgentForm({
  agent,
  canManage,
  isNew,
  isSaving,
  isDeleting,
  saveError,
  onSave,
  onDelete,
  onCancel
}: AgentFormProps): React.JSX.Element {
  const {
    control,
    register,
    handleSubmit,
    formState: { errors, isDirty }
  } = useForm<AgentFormInput, unknown, CreateAgentDefinition>({
    resolver: zodResolver(createAgentDefinitionSchema),
    defaultValues: agent ? agentDefaults(agent) : EMPTY_AGENT
  });
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const readOnly = !canManage;

  useEffect(() => {
    if (!isDirty || readOnly) {
      return;
    }
    const warnBeforeUnload = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [isDirty, readOnly]);

  if (!agent && !isNew) {
    return (
      <section className="editor-panel panel-state" aria-live="polite">
        <div className="empty-orbit" aria-hidden="true">
          <span>D</span>
        </div>
        <h2>Select an agent definition</h2>
        <p>
          Choose an agent from the list or create one to configure its runtime.
        </p>
      </section>
    );
  }

  return (
    <section className="editor-panel" aria-labelledby="agent-editor-heading">
      <div className="panel-heading editor-heading">
        <div>
          <p className="section-kicker">
            {isNew ? "New definition" : "Editor"}
          </p>
          <h2 id="agent-editor-heading">
            {isNew ? "Create agent" : agent?.name}
          </h2>
        </div>
        {!isNew && agent ? (
          <span className="saved-state">
            Updated {DATE_FORMATTER.format(new Date(agent.updatedAt))}
          </span>
        ) : null}
      </div>

      <form
        className="agent-form"
        onSubmit={handleSubmit(async (input) => {
          await onSave(input);
        })}
      >
        <fieldset disabled={readOnly || isSaving || isDeleting}>
          <legend className="sr-only">Agent definition</legend>
          <div className="form-grid">
            <FormField label="Name" error={errors.name?.message}>
              <input autoComplete="off" {...register("name")} />
            </FormField>
            <FormField label="Provider" error={errors.provider?.message}>
              <select {...register("provider")}>
                <option value="ollama">Ollama</option>
              </select>
            </FormField>
          </div>

          <FormField label="Description" error={errors.description?.message}>
            <input autoComplete="off" {...register("description")} />
          </FormField>

          <FormField
            label="Model"
            hint="The model must be available in your local Ollama runtime."
            error={errors.model?.message}
          >
            <input
              autoComplete="off"
              spellCheck={false}
              {...register("model")}
            />
          </FormField>

          <FormField
            label="System prompt"
            hint="Tool output and retrieved text remain untrusted content."
            error={errors.systemPrompt?.message}
          >
            <textarea rows={7} {...register("systemPrompt")} />
          </FormField>

          <div className="limits-grid">
            <FormField label="Max steps" error={errors.maxSteps?.message}>
              <input
                type="number"
                min={1}
                max={100}
                {...register("maxSteps", { valueAsNumber: true })}
              />
            </FormField>
            <FormField
              label="Max tool calls"
              error={errors.maxToolCalls?.message}
            >
              <input
                type="number"
                min={0}
                max={100}
                {...register("maxToolCalls", { valueAsNumber: true })}
              />
            </FormField>
            <FormField label="Max tokens" error={errors.maxTokens?.message}>
              <input
                type="number"
                min={1}
                autoComplete="off"
                {...register("maxTokens", {
                  setValueAs: (value: string) =>
                    value === "" ? undefined : Number(value)
                })}
              />
            </FormField>
            <FormField label="Timeout (ms)" error={errors.timeoutMs?.message}>
              <input
                type="number"
                min={1_000}
                max={3_600_000}
                step={1_000}
                {...register("timeoutMs", { valueAsNumber: true })}
              />
            </FormField>
          </div>

          <Controller
            control={control}
            name="enabledToolIds"
            render={({ field }) => (
              <FormField
                label="Enabled tools"
                hint="Comma-separated tool identifiers, for example knowledge.search."
                error={errors.enabledToolIds?.message}
              >
                <input
                  autoComplete="off"
                  spellCheck={false}
                  value={(field.value ?? []).join(", ")}
                  onBlur={field.onBlur}
                  onChange={(event) =>
                    field.onChange(parseCommaList(event.target.value))
                  }
                />
              </FormField>
            )}
          />

          <Controller
            control={control}
            name="knowledgeBaseIds"
            render={({ field }) => (
              <FormField
                label="Knowledge base IDs"
                hint="Comma-separated UUIDs. Knowledge management arrives in PR #7."
                error={errors.knowledgeBaseIds?.message}
              >
                <input
                  autoComplete="off"
                  spellCheck={false}
                  value={(field.value ?? []).join(", ")}
                  onBlur={field.onBlur}
                  onChange={(event) =>
                    field.onChange(parseCommaList(event.target.value))
                  }
                />
              </FormField>
            )}
          />
        </fieldset>

        {saveError ? <p role="alert">{saveError}</p> : null}
        {readOnly ? (
          <p className="permission-note">
            Members can inspect definitions. Owners and admins can edit them.
          </p>
        ) : (
          <div className="form-actions">
            {!isNew && onDelete && !confirmingDelete ? (
              <button
                className="danger-button"
                type="button"
                disabled={isDeleting}
                onClick={() => setConfirmingDelete(true)}
              >
                Delete
              </button>
            ) : !isNew && onDelete ? (
              <div
                className="delete-confirmation"
                role="group"
                aria-label="Confirm deletion"
              >
                <span>Delete this agent?</span>
                <button
                  className="text-button"
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                >
                  Cancel
                </button>
                <button
                  className="danger-button"
                  type="button"
                  disabled={isDeleting}
                  onClick={() => void onDelete()}
                >
                  {isDeleting ? "Deleting…" : "Delete permanently"}
                </button>
              </div>
            ) : (
              <button className="text-button" type="button" onClick={onCancel}>
                Cancel
              </button>
            )}
            <button
              className="primary-button"
              type="submit"
              disabled={isSaving || (!isDirty && !isNew)}
            >
              {isSaving ? "Saving…" : isNew ? "Create agent" : "Save changes"}
            </button>
          </div>
        )}
      </form>
    </section>
  );
}

function FormField({
  label,
  hint,
  error,
  children
}: {
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
      {error ? <small className="field-error">{error}</small> : null}
    </label>
  );
}

function parseCommaList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function agentDefaults(agent: AgentDefinition): CreateAgentDefinition {
  return {
    name: agent.name,
    description: agent.description ?? "",
    provider: agent.provider,
    model: agent.model,
    systemPrompt: agent.systemPrompt,
    maxSteps: agent.maxSteps,
    maxToolCalls: agent.maxToolCalls,
    ...(agent.maxTokens === null ? {} : { maxTokens: agent.maxTokens }),
    timeoutMs: agent.timeoutMs,
    enabledToolIds: [...agent.enabledToolIds],
    knowledgeBaseIds: [...agent.knowledgeBaseIds]
  };
}
