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
  brief_attempts: number;
  error: string | null;
  started_at: string;
};
type Status = {
  briefsPerAttempt: number;
  access: {
    enabled: boolean;
    reason: string;
    mode?: "manual_public";
    scopes?: Scope[];
    expiresAt?: string;
  };
  runs: Run[];
  briefCounts: Record<string, number>;
  items: {
    rfx_id: string;
    state: "pending" | "failed";
    error: string | null;
  }[];
};
type CollectionStatus = {
  queueSize: number;
  currentTender: string | null;
  completed: number;
  failed: number;
  blocked: number;
  jobs: {
    id: string;
    rfx_id: string;
    opportunity_id: string;
    state: string;
    pack_id: string | null;
    error: string | null;
    login_retries: number;
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
  const [collections, setCollections] = useState<CollectionStatus | null>(null);
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
    try {
      setCollections(await request<CollectionStatus>("/gets/collections"));
    } catch (cause) {
      setError(
        `Document collection status unavailable: ${(cause as Error).message}`,
      );
    }
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
          void request<CollectionStatus>("/gets/collections")
            .then((collected) => {
              if (live) setCollections(collected);
            })
            .catch((cause) => {
              if (live)
                setError(
                  `Document collection status unavailable: ${(cause as Error).message}`,
                );
            });
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
    if (!active && !collections?.queueSize) return;
    const timer = window.setInterval(() => {
      void load().catch((e) => setError(e.message));
    }, 2500);
    return () => window.clearInterval(timer);
  }, [active?.id, collections?.queueSize]);
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
      {error && (
        <p className="gets-error" role="alert">
          {error}
        </p>
      )}
      {!status ? (
        <p className="small muted">Loading GETS status…</p>
      ) : (
        <>
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
                Continue unfinished check
              </Button>
            )}
          </div>
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
              <span>
                Notice briefs (limit {status.briefsPerAttempt} per attempt):{" "}
                {status.briefCounts.complete || 0} complete ·{" "}
                {status.briefCounts.pending || 0} pending ·{" "}
                {status.briefCounts.failed || 0} failed
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
          {collections && collections.jobs.length > 0 && (
            <div className="gets-progress" aria-live="polite">
              <strong>Authenticated document collection</strong>
              <span>
                {collections.queueSize} queued or active ·{" "}
                {collections.completed} packs reconciled · {collections.failed}{" "}
                failed · {collections.blocked} blocked
                {collections.currentTender
                  ? ` · working on RFx ${collections.currentTender}`
                  : ""}
              </span>
              <p className="small muted">
                Pack admission records reader coverage and gaps. A collected
                pack does not start or complete a pursuit report.
              </p>
              <ul className="gets-failures">
                {collections.jobs.slice(0, 8).map((job) => (
                  <li key={job.id}>
                    RFx {job.rfx_id}: {job.state}
                    {job.pack_id && (
                      <>
                        {" "}
                        ·{" "}
                        <a href={`#/pursuit?opportunity=${job.opportunity_id}`}>
                          Open pursuit and sources
                        </a>
                      </>
                    )}
                    {job.login_retries > 0 &&
                      ` · ${job.login_retries} re-login attempts`}
                    {job.error && ` · ${job.error}`}
                    {owner &&
                      [
                        "discovered",
                        "access_needed",
                        "downloading",
                        "downloaded",
                      ].includes(job.state) && (
                        <Button
                          kind="text"
                          disabled={busy}
                          onClick={() =>
                            void act(() =>
                              request(`/gets/collections/${job.id}/cancel`, {}),
                            )
                          }
                        >
                          Cancel collection
                        </Button>
                      )}
                    {owner &&
                      ["failed", "blocked", "cancelled"].includes(
                        job.state,
                      ) && (
                        <Button
                          kind="text"
                          disabled={busy}
                          onClick={() =>
                            void act(() =>
                              request(
                                `/gets/collections/${job.id}/continue`,
                                {},
                              ),
                            )
                          }
                        >
                          Continue after resolving cause
                        </Button>
                      )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}
