"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";

import {
  loginSchema,
  registerSchema,
  type LoginInput,
  type RegisterInput
} from "@devhub/contracts";

type AuthMode = "login" | "register";

interface AuthPanelProps {
  onLogin(input: LoginInput): Promise<void>;
  onRegister(input: RegisterInput): Promise<void>;
}

export function AuthPanel({
  onLogin,
  onRegister
}: AuthPanelProps): React.JSX.Element {
  const [mode, setMode] = useState<AuthMode>("login");

  return (
    <main className="auth-layout">
      <section className="auth-story" aria-labelledby="product-heading">
        <div className="eyebrow">
          <span className="status-dot" aria-hidden="true" />
          Local-first agent operations
        </div>
        <h1 id="product-heading">Build agents you can actually inspect.</h1>
        <p>
          Configure local models, explicit execution limits, tools, and
          knowledge sources from one tenant-isolated workspace.
        </p>
        <ul className="capability-list" aria-label="Platform capabilities">
          <li>Tenant-scoped configuration</li>
          <li>Observable runtime steps</li>
          <li>Local Ollama models</li>
        </ul>
      </section>

      <section className="auth-card" aria-labelledby="auth-heading">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            D
          </span>
          <span>DevHub Command Center</span>
        </div>
        <div className="auth-tabs" role="tablist" aria-label="Authentication">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "login"}
            onClick={() => setMode("login")}
          >
            Sign in
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "register"}
            onClick={() => setMode("register")}
          >
            Create workspace
          </button>
        </div>

        <div>
          <p className="section-kicker">Secure workspace access</p>
          <h2 id="auth-heading">
            {mode === "login" ? "Welcome back" : "Start your workspace"}
          </h2>
          <p className="muted">
            {mode === "login"
              ? "Use the credentials for your isolated tenant."
              : "Your account and owner workspace are created together."}
          </p>
        </div>

        {mode === "login" ? (
          <LoginForm onSubmit={onLogin} />
        ) : (
          <RegisterForm onSubmit={onRegister} />
        )}
      </section>
    </main>
  );
}

function LoginForm({
  onSubmit
}: {
  onSubmit(input: LoginInput): Promise<void>;
}): React.JSX.Element {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" }
  });
  const [submitError, setSubmitError] = useState<string | null>(null);

  return (
    <form
      className="stack-form"
      onSubmit={handleSubmit(async (input) => {
        setSubmitError(null);
        try {
          await onSubmit(input);
        } catch (error) {
          setSubmitError(
            error instanceof Error ? error.message : "Sign in failed."
          );
        }
      })}
    >
      <Field
        label="Email"
        error={errors.email?.message}
        input={
          <input
            type="email"
            autoComplete="email"
            spellCheck={false}
            {...register("email")}
          />
        }
      />
      <Field
        label="Password"
        error={errors.password?.message}
        input={
          <input
            type="password"
            autoComplete="current-password"
            {...register("password")}
          />
        }
      />
      {submitError ? <p role="alert">{submitError}</p> : null}
      <button className="primary-button" type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

function RegisterForm({
  onSubmit
}: {
  onSubmit(input: RegisterInput): Promise<void>;
}): React.JSX.Element {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: "",
      password: "",
      displayName: "",
      tenantName: ""
    }
  });
  const [submitError, setSubmitError] = useState<string | null>(null);

  return (
    <form
      className="stack-form"
      onSubmit={handleSubmit(async (input) => {
        setSubmitError(null);
        try {
          const { displayName, ...requiredInput } = input;
          await onSubmit(
            displayName ? { ...requiredInput, displayName } : requiredInput
          );
        } catch (error) {
          setSubmitError(
            error instanceof Error ? error.message : "Registration failed."
          );
        }
      })}
    >
      <div className="form-grid">
        <Field
          label="Display name"
          error={errors.displayName?.message}
          input={<input autoComplete="name" {...register("displayName")} />}
        />
        <Field
          label="Workspace name"
          error={errors.tenantName?.message}
          input={<input {...register("tenantName")} />}
        />
      </div>
      <Field
        label="Email"
        error={errors.email?.message}
        input={
          <input
            type="email"
            autoComplete="email"
            spellCheck={false}
            {...register("email")}
          />
        }
      />
      <Field
        label="Password"
        hint="Use at least 12 characters."
        error={errors.password?.message}
        input={
          <input
            type="password"
            autoComplete="new-password"
            {...register("password")}
          />
        }
      />
      {submitError ? <p role="alert">{submitError}</p> : null}
      <button className="primary-button" type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Creating workspace…" : "Create workspace"}
      </button>
    </form>
  );
}

function Field({
  label,
  hint,
  error,
  input
}: {
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  input: React.JSX.Element;
}): React.JSX.Element {
  return (
    <label className="field">
      <span>{label}</span>
      {input}
      {hint ? <small>{hint}</small> : null}
      {error ? <small className="field-error">{error}</small> : null}
    </label>
  );
}
