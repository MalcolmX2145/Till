import { useEffect, useRef, useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import { loginSchema } from "@shared/schemas";
import { ApiError } from "@web/api/client";
import { FullPageSpinner } from "@web/components/FullPageSpinner";
import { useAuth } from "@web/hooks/useAuth";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"];
const MAX_PIN = 8;

export function LoginPage() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const usernameRef = useRef<HTMLInputElement>(null);
  const pinRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    usernameRef.current?.focus();
  }, []);

  if (loading) return <FullPageSpinner />;
  if (user) {
    const from = (location.state as { from?: Location } | null)?.from;
    return <Navigate to={from?.pathname ?? defaultRoute(user.role)} replace />;
  }

  function tapKey(key: string) {
    setError(null);
    if (key === "clear") setPin("");
    else if (key === "back") setPin((p) => p.slice(0, -1));
    else setPin((p) => (p.length >= MAX_PIN ? p : p + key));
    pinRef.current?.focus();
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = loginSchema.safeParse({ username, pin });
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      setError(first?.message ?? "Check your details");
      return;
    }

    setBusy(true);
    try {
      await login(parsed.data.username, parsed.data.pin);
      navigate("/", { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not reach the server",
      );
      setPin("");
      pinRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-lg shadow-slate-300/50"
      >
        <div className="mb-6 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            Till
          </h1>
          <p className="mt-1 text-sm text-slate-500">Sign in to start selling</p>
        </div>

        <label
          htmlFor="username"
          className="block text-sm font-medium text-slate-700"
        >
          Username
        </label>
        <input
          id="username"
          ref={usernameRef}
          value={username}
          onChange={(e) => {
            setUsername(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              pinRef.current?.focus();
            }
          }}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-lg outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
        />

        <label
          htmlFor="pin"
          className="mt-4 block text-sm font-medium text-slate-700"
        >
          PIN
        </label>
        <input
          id="pin"
          ref={pinRef}
          value={pin}
          onChange={(e) => {
            setPin(e.target.value.replace(/\D/g, "").slice(0, MAX_PIN));
            setError(null);
          }}
          type="password"
          inputMode="numeric"
          autoComplete="current-password"
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-center text-2xl tracking-[0.4em] outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
        />

        <div className="mt-4 grid grid-cols-3 gap-2">
          {KEYS.map((key) => (
            <button
              key={key}
              type="button"
              tabIndex={-1}
              onClick={() => tapKey(key)}
              className="rounded-lg bg-slate-100 py-3 text-xl font-medium text-slate-800 active:bg-slate-200"
            >
              {key === "back" ? "⌫" : key === "clear" ? "C" : key}
            </button>
          ))}
        </div>

        {error && (
          <p role="alert" className="mt-4 text-center text-sm text-red-600">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="mt-4 w-full rounded-lg bg-slate-900 py-3 text-lg font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}

export function defaultRoute(role: string): string {
  return role === "admin" ? "/admin" : "/sell";
}
