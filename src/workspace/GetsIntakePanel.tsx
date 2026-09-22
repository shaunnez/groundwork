import { useEffect, useRef, useState } from "react";
import { Badge, Button, I } from "../ui";
import { request } from "./data";

type Scope = "current" | "future" | "single";
type Run = {
  id: string;
  scope: Scope;
  requested_rfx_id: string | null;
  state:
    "queued" | "running" | "complete" | "partial" | "blocked" | "cancelled";
  mode: "live" | "fixture";
  new_count: number;
  changed_count: number;
  unchanged_count: number;
  pages_read: number;
  pages_attempted: number;
  unique_discovered: number;
  details_read: number;
  details_failed: number;
  error: string | null;
  started_at: string;
};
type Status = {
  access: {
    enabled: boolean;
    reason: string;
    mode?: "operator_test" | "approved_route";
    scopes?: Scope[];
    expiresAt?: string;
  };
  runs: Run[];
  items: {
    rfx_id: string;
    state: "pending" | "failed";
    error: string | null;
  }[];
};
export function GetsIntakePanel({
  owner,
  onImported,
}: {
  owner: boolean;
  onImported: () => Promise<void>;
}) {
  const [status, setStatus] = useState<Status | null>(null);
  const [scope, setScope] = useState<Scope>("current");
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lastImported = useRef("");
  const active = status?.runs.find(
    (run) => run.state === "running" || run.state === "queued",
  );
  async function load() {
    const next = await request<Status>("/gets/status");
    setStatus(next);
    const latest = next.runs[0];
    if (
      latest &&
      ["complete", "partial", "cancelled"].includes(latest.state) &&
      latest.id !== lastImported.current
    ) {
      lastImported.current = latest.id;
      await onImported();
    }
  }
  useEffect(() => {
    let live = true;
    void request<Status>("/gets/status")
      .then((value) => {
        if (live) {
          setStatus(value);
          const latest = value.runs[0];
          if (
            latest &&
            ["complete", "partial", "cancelled"].includes(latest.state)
          ) {
            lastImported.current = latest.id;
            void onImported().catch((e) => setError((e as Error).message));
          }
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => {
      void load().catch((e) => setError(e.message));
    }, 2500);
    return () => window.clearInterval(timer);
  }, [active?.id]);
  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const latest = status?.runs[0];
  return (
    <section className="gets-panel" aria-labelledby="gets-panel-title">
      <div className="gets-panel-head">
        <div>
          <span className="eyebrow">NEW ZEALAND GOVERNMENT OPPORTUNITIES</span>
          <h2 id="gets-panel-title">Find opportunities on GETS</h2>
          <p className="muted">
            Find public notices for review. Research and reports start only when
            you choose a pursuit.
          </p>
        </div>
        {latest && (
          <Badge
            tone={
              latest.state === "complete"
                ? "info"
                : latest.state === "partial"
                  ? "warning"
                  : "neutral"
            }
          >
            {latest.state}
          </Badge>
        )}
      </div>
      {!status ? (
        <p className="small muted">Loading GETS status…</p>
      ) : (
        <>
          {!status.access.enabled && (
            <p className="gets-access-note" role="status">
              <I.Info size={18} /> {status.access.reason}. The public notice
              check is unavailable.
            </p>
          )}
          {status.access.mode === "operator_test" && (
            <p className="gets-access-note" role="status">
              <I.Info size={18} /> Owner-authorised live test. GETS permission
              is pending; checks are manual and bounded.
            </p>
          )}
          <div className="gets-controls">
            <label>
              Check
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value as Scope)}
                disabled={!owner || busy || !!active}
              >
                <option value="current">Current tenders</option>
                <option value="future">Future opportunities</option>
                <option value="single">One public notice</option>
              </select>
            </label>
            {scope === "single" && (
              <label>
                GETS notice URL
                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://www.gets.govt.nz/…/ExternalTenderDetails.htm?id=…"
                  disabled={!owner || busy || !!active}
                />
              </label>
            )}
            <Button
              onClick={() =>
                void act(() =>
                  request("/gets/runs", {
                    scope,
                    ...(scope === "single" ? { url } : {}),
                  }),
                )
              }
              disabled={!owner || !status.access.enabled || busy || !!active}
            >
              <I.Refresh size={17} /> Check GETS now
            </Button>
            {active && owner && (
              <Button
                kind="text"
                disabled={busy}
                onClick={() =>
                  void act(() => request(`/gets/runs/${active.id}/cancel`, {}))
                }
              >
                Cancel check
              </Button>
            )}
            {latest?.state === "partial" && owner && status.access.enabled && (
              <Button
                kind="secondary"
                disabled={busy}
                onClick={() =>
                  void act(() => request(`/gets/runs/${latest.id}/retry`, {}))
                }
              >
                Retry unfinished notices
              </Button>
            )}
          </div>
          {error && (
            <p className="gets-error" role="alert">
              {error}
            </p>
          )}
          {latest && (
            <div className="gets-progress" aria-live="polite">
              <strong>
                {latest.state === "complete"
                  ? "Check complete"
                  : latest.state === "partial"
                    ? "Check incomplete"
                    : latest.state === "cancelled"
                      ? "Check cancelled"
                      : "Checking GETS"}
              </strong>
              <span>
                {latest.new_count} new · {latest.changed_count} changed ·{" "}
                {latest.unchanged_count} unchanged · {latest.details_failed}{" "}
                unread
              </span>
              <details>
                <summary>Coverage details</summary>
                <p>
                  {latest.pages_read} of {latest.pages_attempted} listing
                  attempts read · {latest.details_read} of{" "}
                  {latest.unique_discovered} discovered notices read.{" "}
                  {latest.error || ""}
                </p>
              </details>
              {status.items.some((item) => item.state === "failed") && (
                <div className="gets-failures">
                  <strong>Not read</strong>
                  <ul>
                    {status.items
                      .filter((item) => item.state === "failed")
                      .map((item) => (
                        <li key={item.rfx_id}>
                          RFx {item.rfx_id}:{" "}
                          {item.error || "Detail could not be read"}
                        </li>
                      ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
