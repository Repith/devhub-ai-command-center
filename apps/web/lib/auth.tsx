"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";

import {
  accessTokenResponseSchema,
  authenticatedUserSchema,
  type AuthenticatedUser,
  type LoginInput,
  type RegisterInput
} from "@devhub/contracts";

import { apiRequest, apiRequestEmpty } from "./api-client";

type AuthStatus = "loading" | "anonymous" | "authenticated";

interface AuthContextValue {
  status: AuthStatus;
  user: AuthenticatedUser | null;
  accessToken: string | null;
  login(input: LoginInput): Promise<void>;
  register(input: RegisterInput): Promise<void>;
  logout(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({
  children
}: Readonly<{ children: ReactNode }>): React.JSX.Element {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  const loadSession = useCallback(async (token: string): Promise<void> => {
    const authenticatedUser = await apiRequest("/me", authenticatedUserSchema, {
      accessToken: token
    });
    setAccessToken(token);
    setUser(authenticatedUser);
    setStatus("authenticated");
  }, []);

  const authenticate = useCallback(
    async (
      path: "/auth/login" | "/auth/register",
      input: LoginInput | RegisterInput
    ): Promise<void> => {
      const token = await apiRequest(path, accessTokenResponseSchema, {
        method: "POST",
        body: input
      });
      await loadSession(token.accessToken);
    },
    [loadSession]
  );

  const clearSession = useCallback((): void => {
    setAccessToken(null);
    setUser(null);
    setStatus("anonymous");
    queryClient.clear();
  }, [queryClient]);

  useEffect(() => {
    let active = true;

    async function restoreSession(): Promise<void> {
      try {
        const token = await apiRequest(
          "/auth/refresh",
          accessTokenResponseSchema,
          { method: "POST" }
        );
        if (active) {
          await loadSession(token.accessToken);
        }
      } catch {
        if (active) {
          clearSession();
        }
      }
    }

    void restoreSession();
    return () => {
      active = false;
    };
  }, [clearSession, loadSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      accessToken,
      login: (input) => authenticate("/auth/login", input),
      register: (input) => authenticate("/auth/register", input),
      logout: async () => {
        try {
          await apiRequestEmpty("/auth/logout", { method: "POST" });
        } finally {
          clearSession();
        }
      }
    }),
    [accessToken, authenticate, clearSession, status, user]
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider.");
  }
  return context;
}
