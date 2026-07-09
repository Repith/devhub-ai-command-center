"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { formatApiClientError } from "../../../../lib/api-client";
import { useAuth } from "../../../../lib/auth";
import { completeGithubOAuth } from "../../../../lib/github-api";

export default function GithubOAuthCallbackPage(): React.JSX.Element {
  return (
    <Suspense fallback={<CallbackState message="Completing GitHub OAuth..." />}>
      <GithubOAuthCallback />
    </Suspense>
  );
}

function GithubOAuthCallback(): React.JSX.Element {
  const auth = useAuth();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState("Completing GitHub OAuth...");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (auth.status === "loading") {
      return;
    }
    if (!auth.accessToken) {
      setFailed(true);
      setMessage("Sign in again before completing GitHub OAuth.");
      return;
    }
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    if (!code || !state) {
      setFailed(true);
      setMessage("GitHub OAuth callback is missing code or state.");
      return;
    }
    void completeGithubOAuth(auth.accessToken, { code, state })
      .then(() => {
        setFailed(false);
        setMessage("GitHub is connected. Returning to integrations...");
        window.setTimeout(
          () => window.location.assign("/?section=integrations"),
          900
        );
      })
      .catch((error: unknown) => {
        setFailed(true);
        setMessage(formatApiClientError(error));
      });
  }, [auth.accessToken, auth.status, searchParams]);

  return <CallbackState failed={failed} message={message} />;
}

function CallbackState({
  failed = false,
  message
}: {
  failed?: boolean;
  message: string;
}): React.JSX.Element {
  return (
    <main className="session-loading" role={failed ? "alert" : "status"}>
      <div className="brand-mark" aria-hidden="true">
        D
      </div>
      <p>{message}</p>
      {failed ? (
        <a className="secondary-button" href="/?section=integrations">
          Return to integrations
        </a>
      ) : null}
    </main>
  );
}
