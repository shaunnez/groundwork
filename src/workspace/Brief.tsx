import { useEffect, useState } from "react";
import { Badge, Button, Empty, I, Loading, Notice } from "../ui";
import { Heading } from "./Chrome";
import {
  date,
  request,
  type Bootstrap,
  type Navigate,
  type SavedReport,
} from "./data";
import type { Action } from "./Workflows";
interface CollectionSummary {
  id: string;
  kind: "watchlist" | "weekly";
  client_id: string | null;
  period_start: string;
  created_at: string;
}
interface Collection extends CollectionSummary {
  stale: boolean;
  payload: { scope: string; limitations: string[] };
  items: {
    opportunityId: string;
    title: string;
    buyer: string;
    cutoff: string;
    provenance: string;
    reportId: string | null;
    report: Pick<SavedReport, "payload"> | null;
    freshness: { stale: boolean; reviewState: string } | null;
  }[];
}
export function BriefView({
  boot,
  go,
  action,
  busy,
  onError,
}: {
  boot: Bootstrap;
  go: Navigate;
  action: Action;
  busy: boolean;
  onError: (error: Error) => void;
}) {
  const [list, setList] = useState<CollectionSummary[] | null>(null),
    [current, setCurrent] = useState<Collection | null>(null),
    [client, setClient] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true;
    void request<{ collections: CollectionSummary[] }>("/collections")
      .then(async (d) => {
        if (!live) return;
        const weekly = d.collections.filter((c) => c.kind === "weekly");
        setList(weekly);
        const id = weekly[0]?.id;
        if (id) {
          const c = await request<Collection>("/collections/" + id);
          if (live) setCurrent(c);
        }
      })
      .catch((e) => {
        if (live) onError(e);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, []);
  return (
    <>
      <Heading
        go={go}
        back={{ label: "Reports", page: "reports" }}
        eyebrow="WEEKLY INTELLIGENCE BRIEF"
        title="Your week in procurement."
        description={
          current
            ? `Week beginning ${date(current.period_start)} · ${current.payload.scope}`
            : "Changes and next steps across your saved pursuits."
        }
        actions={<Badge>Internal draft</Badge>}
      />
      {current?.stale && (
        <Notice title="This brief needs refreshing">
          Prepare a new brief to include the latest saved reports. This version
          retains its original evidence.
        </Notice>
      )}
      <div className="report-layout connected-report-layout">
        <aside className="report-outline">
          <span className="eyebrow">THIS WEEK</span>
          <p>
            {current?.items.length || 0} tracked opportunities
            <br />
            Each retains its own assessment date.
          </p>
          <label>
            Saved brief
            <select
              aria-label="Saved brief"
              value={current?.id || ""}
              onChange={(e) =>
                void action(async () =>
                  setCurrent(await request("/collections/" + e.target.value)),
                )
              }
            >
              <option value="" disabled>
                Choose a saved brief
              </option>
              {list?.map((c) => (
                <option key={c.id} value={c.id}>
                  {date(c.period_start)} ·{" "}
                  {new Date(c.created_at).toLocaleTimeString("en-NZ")}
                </option>
              ))}
            </select>
          </label>
          <label>
            Firm scope
            <select
              aria-label="Brief firm scope"
              value={client}
              onChange={(e) => setClient(e.target.value)}
            >
              <option value="">All tracked opportunities</option>
              {boot.clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.legal_name}
                </option>
              ))}
            </select>
          </label>
          <Button
            kind="secondary"
            disabled={
              busy || boot.role === "reviewer" || !boot.opportunities.length
            }
            onClick={() =>
              void action(async () => {
                const c = await request<{ id: string }>("/collections", {
                  kind: "weekly",
                  clientId: client || null,
                });
                const d = await request<{ collections: CollectionSummary[] }>(
                  "/collections",
                );
                setList(d.collections.filter((x) => x.kind === "weekly"));
                setCurrent(await request("/collections/" + c.id));
              }, "Brief prepared from saved assessments.")
            }
          >
            Prepare current brief
          </Button>
          <p className="small muted">
            Uses saved intelligence. This does not start another model
            assessment or publish externally.
          </p>
        </aside>
        <article className="report-body">
          {loading ? (
            <Loading label="Opening your brief" />
          ) : !current ? (
            <Empty
              title="Your first brief starts with your pursuits"
              description="Prepare a brief from your saved assessments. Unassessed opportunities remain visible as gaps."
            />
          ) : (
            <>
              <h2>What deserves your attention.</h2>
              <p className="lead">
                Changes, competitive context and next steps from your tracked
                opportunities.
              </p>
              {current.items.map((item) => (
                <section className="brief-item" key={item.opportunityId}>
                  <Badge>
                    {item.provenance === "synthetic"
                      ? "Synthetic evaluation"
                      : "Public evidence"}
                  </Badge>
                  <h2>{item.title}</h2>
                  <p className="small muted">
                    {item.buyer} ·{" "}
                    {item.report ? "Assessed" : "Requested cutoff"}{" "}
                    {date(item.cutoff)}
                  </p>
                  {item.report ? (
                    <>
                      <Badge tone="info">
                        {item.report.payload.assessment.verdict.recommendation}
                      </Badge>
                      <p>{item.report.payload.summarySentences[0]}</p>
                      <h3>Competitive context</h3>
                      <p>
                        Current supplier:{" "}
                        {item.report.payload.intelligence.incumbent
                          .entityName || "Not established"}
                        . {item.report.payload.intelligence.metrics.awardCount}{" "}
                        records in the admitted award population.
                      </p>
                      <h3>Recommended next step</h3>
                      <p>{item.report.payload.summarySentences[3]}</p>
                      <h3>Next evidence to collect</h3>
                      <p>
                        {
                          item.report.payload.assessment.hypotheses
                            .nextCollection
                        }
                      </p>
                      {item.report.payload.deliverable?.kind === "weekly" && (
                        <details>
                          <summary>
                            Changes since the previous assessment
                          </summary>
                          <p>
                            {
                              item.report.payload.deliverable
                                .changesSincePrevious.note
                            }
                          </p>
                          {item.report.payload.deliverable.changesSincePrevious.rows
                            .filter((r) => r.status !== "UNCHANGED")
                            .map((r, i) => (
                              <p key={i}>
                                <Badge>
                                  {r.status.replaceAll("_", " ").toLowerCase()}
                                </Badge>{" "}
                                {r.currentId
                                  ? item.report!.payload.assessment.claims.find(
                                      (c) => c.id === r.currentId,
                                    )?.text
                                  : "Absent from this run; closure is not established."}
                              </p>
                            ))}
                        </details>
                      )}
                      {item.freshness?.stale && (
                        <p className="small muted">
                          Newer evidence or analysis is available.
                        </p>
                      )}
                      <Button
                        kind="secondary"
                        onClick={() =>
                          go("report", item.opportunityId, item.reportId!)
                        }
                      >
                        Read assessment and citations <I.ArrowRight size={16} />
                      </Button>
                    </>
                  ) : (
                    <>
                      <p>This opportunity is awaiting assessment.</p>
                      <Button
                        kind="secondary"
                        onClick={() => go("pursuit", item.opportunityId)}
                      >
                        Open pursuit
                      </Button>
                    </>
                  )}
                </section>
              ))}
              <footer className="report-end">
                {current.payload.limitations.map((l, i) => (
                  <p className="small muted" key={i}>
                    {l}
                  </p>
                ))}
              </footer>
            </>
          )}
        </article>
      </div>
    </>
  );
}
