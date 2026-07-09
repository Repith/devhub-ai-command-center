"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { completeGmailOAuth } from "@/lib/gmail-api";
import { useAuth } from "@/lib/auth";
import { formatApiClientError } from "@/lib/api-client";

export default function GmailOAuthCallbackPage(): React.JSX.Element {
  return (
    <Suspense fallback={<CallbackState message="Completing Gmail OAuth..." />}>
      <GmailOAuthCallback />
    </Suspense>
  );
}

function GmailOAuthCallback(): React.JSX.Element {
  const auth = useAuth();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState("Completing Gmail OAuth...");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (auth.status === "loading") {
      return;
    }
    if (!auth.accessToken) {
      setFailed(true);
      setMessage("Sign in again before completing Gmail OAuth.");
      return;
    }
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    if (!code || !state) {
      setFailed(true);
      setMessage("Gmail OAuth callback is missing code or state.");
      return;
    }
    void completeGmailOAuth(auth.accessToken, { code, state })
      .then(() => {
        setFailed(false);
        setMessage("Gmail is connected. Returning to the command center...");
        window.setTimeout(() => window.location.assign("/?section=gmail"), 900);
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
        <a className="secondary-button" href="/">
          Return to DevHub
        </a>
      ) : null}
    </main>
  );
}
