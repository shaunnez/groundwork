import { useEffect, useState } from "react";
import { Badge, Button } from "./ui.tsx";
type Row = Record<string, any>;
export function LocalCollections({
  request,
  clients,
  onReport,
  onError,
}: {
  request: (path: string, body?: unknown) => Promise<Row>;
  clients: Row[];
  onReport: (id: string) => void;
  onError: (error: string) => void;
}) {
  const [list, setList] = useState<Row | null>(null),
    [current, setCurrent] = useState<Row | null>(null),
    [busy, setBusy] = useState(false);
  const refresh = async () => setList(await request("/collections"));
  useEffect(() => {
    void refresh().catch((e) => onError(e.message));
  }, []);
  const action = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const open = async (id: string) =>
    setCurrent(await request("/collections/" + id));
  return (
    <>
      <section className="local-card">
        <h2>Watchlists and weekly briefs</h2>
        <p>
          Bring your tracked opportunities together, with each assessment's
          cutoff, evidence and review state preserved.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void action(async () => {
              const saved = await request("/collections", {
                kind: f.get("kind"),
                clientId: f.get("client") || null,
              });
              await refresh();
              await open(saved.id);
            });
          }}
        >
          <div className="local-grid">
            <label>
              Collection
              <select name="kind">
                <option value="watchlist">Daily watchlist</option>
                <option value="weekly">Weekly watch brief</option>
              </select>
            </label>
            <label>
              Scope
              <select name="client">
                <option value="">
                  All tracked opportunities in this account
                </option>
                {clients.map((c) => (
                  <option value={c.id} key={c.id}>
                    {c.legal_name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <Button disabled={busy} type="submit">
            Compile current collection
          </Button>
        </form>
        <div className="collection-list">
          <h3>Saved collections</h3>
          {list?.collections.map((c: Row) => (
            <button
              className="local-opportunity"
              aria-current={current?.id === c.id ? "true" : undefined}
              key={c.id}
              onClick={() => void action(() => open(c.id))}
            >
              <strong>
                {c.kind === "weekly" ? "Weekly watch brief" : "Daily watchlist"}{" "}
                · {c.period_start}
              </strong>
              <span>
                {c.client_id ? "Client scope" : "Account scope"} ·{" "}
                {new Date(c.created_at).toLocaleString("en-NZ")}
              </span>
            </button>
          ))}
        </div>
      </section>
      {current && (
        <article className="local-report">
          <header>
            <span className="eyebrow">
              {current.kind === "weekly"
                ? "WEEKLY WATCH BRIEF"
                : "DAILY WATCHLIST"}{" "}
              · INTERNAL DRAFT
            </span>
            <h2>
              {current.kind === "weekly"
                ? "Your week in procurement."
                : "Your opportunities, in context."}
            </h2>
            <p>
              {current.payload.scope} · Period begins {current.period_start}
            </p>
            <Badge>{current.items.length} tracked opportunities</Badge>
          </header>
          {current.stale && (
            <p className="local-error">
              Tracked opportunities or their evidence have changed. Compile a
              new collection before delivery.
            </p>
          )}
          {current.items.map((item: Row) => {
            const p = item.report?.payload,
              d = p?.deliverable,
              a = p?.assessment;
            return (
              <section key={item.opportunityId}>
                <span className="eyebrow">{item.buyer}</span>
                <h3>{item.title}</h3>
                <p>
                  {item.provenance === "synthetic"
                    ? "Synthetic evidence"
                    : "Public evidence"}{" "}
                  · Assessment cutoff {item.cutoff}
                </p>
                {!p ? (
                  <p>
                    Assessment pending. This notice has no completed
                    intelligence package yet.
                  </p>
                ) : (
                  <>
                    <Badge>{a.verdict.recommendation}</Badge>
                    <Badge>{item.freshness?.reviewState}</Badge>
                    {item.freshness?.stale && (
                      <p className="local-error">
                        A newer version or evidence is available for this
                        opportunity.
                      </p>
                    )}
                    {p.summarySentences.map((t: string, i: number) => (
                      <p key={i}>{t}</p>
                    ))}
                    {current.kind === "weekly" && d?.changesSincePrevious && (
                      <>
                        <h4>What changed</h4>
                        <p>{d.changesSincePrevious.note}</p>
                        {d.changesSincePrevious.rows
                          .filter((r: Row) => r.status !== "UNCHANGED")
                          .map((r: Row, i: number) => (
                            <p key={i}>
                              <Badge>{r.status.replaceAll("_", " ")}</Badge>{" "}
                              {r.currentText ??
                                r.previousText ??
                                a.claims.find((c: Row) => c.id === r.currentId)
                                  ?.text ??
                                "See the source report comparison"}
                              {r.status === "ABSENT_FROM_THIS_RUN"
                                ? " — not evidence of closure."
                                : ""}
                            </p>
                          ))}
                      </>
                    )}
                    <h4>Competitive context</h4>
                    <p>
                      Incumbent:{" "}
                      {p.intelligence.incumbent.entityName ?? "Unknown"} ·{" "}
                      {p.intelligence.incumbent.status.replaceAll("_", " ")}
                    </p>
                    <p>
                      Recorded supplier names:{" "}
                      {p.intelligence.entities
                        .map((e: Row) => e.name)
                        .join(", ") || "Not established"}
                      . {p.intelligence.metrics.awardCount} records in this
                      admitted award population; retention policy pending.
                    </p>
                    <h4>Next evidence to collect</h4>
                    <p>{a.hypotheses.nextCollection}</p>
                    <Button
                      kind="secondary"
                      onClick={() => onReport(item.reportId)}
                    >
                      Open assessment and citations
                    </Button>
                  </>
                )}
              </section>
            );
          })}
          <section>
            <h3>Scope and limitations</h3>
            {current.payload.limitations.map((t: string) => (
              <p key={t}>{t}</p>
            ))}
            <Button
              disabled={busy || !current.readyForInternalDelivery}
              onClick={() =>
                void action(async () => {
                  await request(
                    "/collections/" + current.id + "/deliver-local",
                    {},
                  );
                  await refresh();
                  await open(current.id);
                })
              }
            >
              Deliver collection to local inbox
            </Button>
            <p className="muted">
              Every included report and its underlying pursuit must be current
              and approved. No customer publication.
            </p>
            {list?.deliveries.some(
              (d: Row) => d.collection_id === current.id,
            ) && (
              <p role="status">
                This immutable collection is in the local inbox.
              </p>
            )}
          </section>
        </article>
      )}
      <section className="local-card">
        <h2>Delivered collections</h2>
        {list?.deliveries.length ? (
          list.deliveries.map((d: Row) => (
            <p key={d.id}>
              {new Date(d.created_at).toLocaleString()}{" "}
              <Button
                kind="text"
                onClick={() => void action(() => open(d.collection_id))}
              >
                Open delivered collection
              </Button>
            </p>
          ))
        ) : (
          <p>No collection has been delivered locally.</p>
        )}
      </section>
    </>
  );
}
