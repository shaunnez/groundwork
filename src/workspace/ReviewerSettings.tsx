import { useEffect, useState } from "react";
import { Button, Notice } from "../ui";
import { Heading } from "./Chrome";
import { request, type Navigate } from "./data";

type Settings = {
  hosted: boolean;
  firecrawl: {
    enabled: boolean;
    keyConfigured: boolean;
    budget: { allowance: string; reserved: string; spent: string };
  };
  claude: {
    authenticated: boolean;
    account: string | null;
    plan: string | null;
    issue: string | null;
    generationApproved: boolean;
    loginCommand: string;
  };
};

export function ReviewerSettings({
  go,
  onSaved,
}: {
  go: Navigate;
  onSaved: () => Promise<void>;
}) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [allowance, setAllowance] = useState("");
  const [key, setKey] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    const current = await request<Settings>("/settings");
    setSettings(current);
    setAllowance(current.firecrawl.budget.allowance);
  }
  useEffect(() => {
    let live = true;
    void request<Settings>("/settings")
      .then((current) => {
        if (live) {
          setSettings(current);
          setAllowance(current.firecrawl.budget.allowance);
        }
      })
      .catch((cause: Error) => {
        if (live) setError(cause.message);
      });
    return () => {
      live = false;
    };
  }, []);
  async function act(operation: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await operation();
      await load();
      await onSaved();
      setMessage(success);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const firecrawl = settings?.firecrawl;
  const claude = settings?.claude;
  return (
    <>
      <Heading
        go={go}
        eyebrow="REVIEWER TOOLS"
        title="Settings"
        description="Manage this workspace’s research allowance and check the Claude worker sign-in."
        back={{ label: "Reviewer tools", page: "ops" }}
      />
      {error && (
        <Notice title="Setting could not be changed" tone="warning">
          {error}
        </Notice>
      )}
      {message && <p role="status">{message}</p>}
      {!settings && !error && <p role="status">Loading settings…</p>}
      {firecrawl && (
        <section className="connected-panel settings-panel">
          <h2>Firecrawl research</h2>
          <p>
            Public source search is {firecrawl.enabled ? "enabled" : "disabled"}
            . API key: {firecrawl.keyConfigured ? "saved" : "missing"}.
          </p>
          <p className="small muted">
            This database: {firecrawl.budget.spent} spent,{" "}
            {firecrawl.budget.reserved} reserved, {firecrawl.budget.allowance}{" "}
            allowed. Each new search reserves two credits.
          </p>
          <form
            className="connected-form"
            onSubmit={(event) => {
              event.preventDefault();
              void act(
                () =>
                  request("/settings/firecrawl/budget", {
                    allowance: Number(allowance),
                  }),
                "Research allowance saved.",
              );
            }}
          >
            <label>
              Credit allowance for this database
              <input
                type="number"
                min="0"
                max="50"
                step="1"
                required
                value={allowance}
                onChange={(event) => setAllowance(event.target.value)}
              />
            </label>
            <p className="small muted">
              Local and Railway databases have separate ledgers against the same
              provider allowance. Reconcile the shared remaining credits before
              increasing either cap. This setting does not purchase credits.
            </p>
            <Button type="submit" disabled={busy}>
              Save allowance
            </Button>
          </form>
          <form
            className="connected-form"
            onSubmit={(event) => {
              event.preventDefault();
              void act(async () => {
                await request("/settings/firecrawl/key", { key });
                setKey("");
              }, "Firecrawl API key saved.");
            }}
          >
            <label>
              Replace Firecrawl API key
              <input
                type="password"
                autoComplete="new-password"
                value={key}
                onChange={(event) => setKey(event.target.value)}
                required
                minLength={10}
                maxLength={512}
                placeholder="Paste a new key"
              />
            </label>
            <p className="small muted">
              The key is written to a private server file. Groundwork never
              returns the key to this page.
            </p>
            <Button type="submit" disabled={busy || !key}>
              Save API key
            </Button>
          </form>
          {!firecrawl.enabled && (
            <label className="connected-check">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              I confirmed included provider credits and that extra usage is off.
            </label>
          )}
          <Button
            kind="secondary"
            disabled={
              busy ||
              (!firecrawl.enabled && (!confirmed || !firecrawl.keyConfigured))
            }
            onClick={() =>
              void act(
                async () => {
                  await request("/settings/firecrawl", {
                    enabled: !firecrawl.enabled,
                    confirmedIncludedCredits: confirmed,
                  });
                  setConfirmed(false);
                },
                `Public research ${firecrawl.enabled ? "disabled" : "enabled"}.`,
              )
            }
          >
            {firecrawl.enabled ? "Disable Firecrawl" : "Enable Firecrawl"}
          </Button>
        </section>
      )}
      {claude && (
        <section className="connected-panel settings-panel">
          <h2>Claude subscription</h2>
          <p>
            Worker authentication:{" "}
            {claude.authenticated ? "signed in with Claude" : "not ready"}
            {claude.account ? ` · ${claude.account}` : ""}.
          </p>
          {claude.issue && <p className="small muted">{claude.issue}</p>}
          <p className="small muted">
            Plan reported by the CLI: {claude.plan || "unavailable"}. Report
            generation approval:{" "}
            {claude.generationApproved
              ? "enabled on this deployment"
              : "disabled on this deployment"}
            . The CLI status does not verify remaining subscription usage or
            extra usage settings.
          </p>
          <div className="settings-actions">
            <Button
              kind="secondary"
              disabled={busy}
              onClick={() =>
                void act(async () => {}, "Claude status refreshed.")
              }
            >
              Check authentication
            </Button>
            <Button
              kind="secondary"
              disabled={busy || !claude.authenticated}
              onClick={() =>
                void act(
                  () => request("/settings/claude/logout", {}),
                  "Claude worker signed out.",
                )
              }
            >
              Sign out worker
            </Button>
          </div>
          <details>
            <summary>Sign in or reauthenticate the Claude worker</summary>
            <p>
              Use the official Claude CLI under the same account and home
              directory as the worker. Complete Anthropic’s browser sign-in and
              paste any code into the CLI terminal. Then check authentication
              above.
            </p>
            {settings.hosted && (
              <p>Open a Railway CLI shell for this Groundwork service.</p>
            )}
            <p>
              Run <code>{claude.loginCommand}</code> in that shell under the
              account used by your Groundwork worker.
            </p>
            <p>
              <a
                href="https://code.claude.com/docs/en/authentication"
                target="_blank"
                rel="noreferrer"
              >
                Official Claude authentication instructions
              </a>
            </p>
          </details>
        </section>
      )}
    </>
  );
}
