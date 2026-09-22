import { useEffect, useState } from "react";
import { Button, Badge } from "./ui.tsx";
type Row = Record<string, any>;
export function LocalOperations({
  request,
  selected,
  onReport,
  onError,
}: {
  request: (path: string, body?: unknown) => Promise<Row>;
  selected: string;
  onReport: (id: string) => void;
  onError: (s: string) => void;
}) {
  const [data, setData] = useState<Row | null>(null),
    [busy, setBusy] = useState(false);
  const load = async () => setData(await request("/operations"));
  useEffect(() => {
    let active = true;
    const read = async () => {
      try {
        const d = await request("/operations");
        if (active) setData(d);
      } catch (e) {
        if (active) onError((e as Error).message);
      }
    };
    void read();
    const timer = setInterval(() => void read(), 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  const action = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      await load();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <section className="local-card">
        <h2>Local refresh and delivery</h2>
        <p>
          Refreshes preserve the assessment cutoff. New leads require permitted
          source acquisition and reassessment. Nothing leaves this local
          workspace.
        </p>
        {!selected ? (
          <p>Select an opportunity in the pursuit room to add a schedule.</p>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void action(() =>
                request(`/opportunities/${selected}/schedules`, {
                  kind: f.get("kind"),
                  intervalHours: Number(f.get("intervalHours")),
                  researchQuery: String(f.get("query") ?? "").trim() || null,
                }),
              );
            }}
          >
            <div className="local-grid">
              <label>
                Deliverable
                <select name="kind">
                  <option value="watchlist">Daily watchlist</option>
                  <option value="weekly">Weekly brief</option>
                  <option value="competitor">Competitor profile</option>
                </select>
              </label>
              <label>
                Refresh interval
                <select name="intervalHours">
                  <option value="24">Daily</option>
                  <option value="168">Weekly</option>
                </select>
              </label>
            </div>
            <label>
              Optional public discovery query
              <input
                name="query"
                placeholder="Blank means reuse saved evidence only"
              />
            </label>
            <p className="muted">
              A search uses up to 2 included credits per refresh, five
              unverified leads, within the existing 50-credit ceiling. No
              automatic scraping or publication.
            </p>
            <Button type="submit" disabled={busy}>
              Schedule local refresh
            </Button>
          </form>
        )}
        {data?.schedules.map((s: Row) => (
          <article className="local-row" key={s.id}>
            <strong>
              {s.title} · {s.kind}
            </strong>
            <Badge>{s.enabled ? "Scheduled" : "Paused"}</Badge>
            <p>
              Next refresh: {new Date(s.next_at).toLocaleString()} ·{" "}
              {s.interval_hours} hours
            </p>
            <p>
              {s.last_result?.error ??
                s.last_result?.reason ??
                s.last_result?.state ??
                "Awaiting first local refresh"}
            </p>
            {s.last_result?.reportId && (
              <Button
                kind="text"
                onClick={() => onReport(s.last_result.reportId)}
              >
                Read refreshed draft
              </Button>
            )}
            {s.enabled && (
              <Button
                kind="text"
                disabled={busy}
                onClick={() =>
                  void action(() => request(`/schedules/${s.id}/pause`, {}))
                }
              >
                Pause refresh
              </Button>
            )}
          </article>
        ))}
      </section>
      <section className="local-card">
        <h2>Discovery leads</h2>
        <p>
          Search results are leads, not cited evidence or confirmed
          opportunities.
        </p>
        {data?.leads.length ? (
          data.leads.map((s: Row) => (
            <details key={s.id}>
              <summary>
                {s.title} · {s.query}
              </summary>
              {s.result?.result?.data?.web?.map((hit: Row) => (
                <p key={hit.url}>
                  <a href={hit.url} target="_blank" rel="noreferrer">
                    {hit.title ?? hit.url}
                  </a>{" "}
                  — {hit.description}
                </p>
              ))}
            </details>
          ))
        ) : (
          <p>No discovery searches recorded.</p>
        )}
      </section>
      <section className="local-card">
        <h2>Local delivery inbox</h2>
        <p>
          Only internally approved, current versions appear here. This is a test
          sink, not customer publication.
        </p>
        {data?.deliveries.length ? (
          data.deliveries.map((d: Row) => (
            <article className="local-row" key={d.id}>
              <strong>
                {d.title} · {d.kind}
              </strong>
              <p>{new Date(d.created_at).toLocaleString()}</p>
              <Button kind="text" onClick={() => onReport(d.report_id)}>
                Open delivered version
              </Button>
            </article>
          ))
        ) : (
          <p>No deliveries yet.</p>
        )}
      </section>
      <section className="local-card">
        <h2>Weekly review sample</h2>
        <p>
          One locally delivered version per account per UTC week. Sampling never
          approves a report.
        </p>
        {data?.samples.map((s: Row) => (
          <p key={s.id}>
            {s.week_start} · {s.title}{" "}
            <Button kind="text" onClick={() => onReport(s.report_id)}>
              Inspect sample
            </Button>
          </p>
        ))}
      </section>
    </>
  );
}
