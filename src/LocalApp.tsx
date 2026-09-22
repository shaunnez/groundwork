import { LocalCollections } from "./LocalCollections.tsx";
import { LocalOperations } from "./LocalOperations.tsx";
import { EnrichedSections } from "./LocalDeliverables.tsx";
import { useEffect, useState, type FormEvent } from "react";
import { Badge, Button } from "./ui.tsx";
import type { VerifiedReport } from "../shared/contracts.ts";
import "./local.css";
type Row = Record<string, any>;
async function api<T = Row>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(`/api${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers:
      body instanceof FormData
        ? { "x-groundwork-request": "local" }
        : {
            "content-type": "application/json",
            "x-groundwork-request": "local",
          },
    body:
      body === undefined
        ? undefined
        : body instanceof FormData
          ? body
          : JSON.stringify(body),
  });
  const v = await r.json();
  if (!r.ok)
    throw Object.assign(new Error(v.error ?? "Request failed"), {
      status: r.status,
    });
  return v;
}
const value = (form: HTMLFormElement, name: string) =>
  String(new FormData(form).get(name) ?? "");
export function LocalApp() {
  const [boot, setBoot] = useState<Row | null>(null),
    [session, setSession] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [assessmentCutoff, setAssessmentCutoff] = useState("");
  const [selected, setSelected] = useState(""),
    [detail, setDetail] = useState<Row | null>(null),
    [report, setReport] = useState<Row | null>(null),
    [source, setSource] = useState<Row | null>(null),
    [search, setSearch] = useState<Row | null>(null),
    [researchResult, setResearchResult] = useState<Row | null>(null),
    [tab, setTab] = useState("pursuit");
  const refresh = async () => {
    try {
      setBoot(await api("/bootstrap"));
      setSession(true);
    } catch (e) {
      if ((e as Row).status !== 401) setError((e as Error).message);
    }
  };
  const load = async (id: string) => {
    setDetail(await api(`/opportunities/${id}`));
  };
  useEffect(() => {
    void refresh();
  }, []);
  useEffect(() => {
    if (!selected) return;
    let live = true;
    const run = async () => {
      try {
        const d = await api(`/opportunities/${selected}`);
        if (live) setDetail(d);
      } catch (e) {
        if (live) setError((e as Error).message);
      }
    };
    void run();
    const timer = setInterval(() => void run(), 2500);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [selected]);
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (source)
      document
        .querySelector(".local-evidence")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [source]);
  useEffect(() => {
    if (report)
      document
        .querySelector(".local-report")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [report]);
  const readReport = async (id: string) => {
    setReport(await api(`/reports/${id}`));
    setSource(null);
  };
  const readEvidence = async (unitId: string) => {
    const location = await api("/units/" + unitId);
    const found = await api("/sources/" + location.sourceId);
    setSource({ ...found, selectedUnit: unitId });
  };
  const latestPursuit = detail?.reports.find((r: Row) => r.kind === "pursuit");
  const nextCutoff =
    assessmentCutoff ||
    latestPursuit?.payload.cutoff ||
    detail?.opportunity.cutoff;
  const historicalReplay = Boolean(
    latestPursuit && nextCutoff < latestPursuit.payload.cutoff,
  );
  const nextParentId = historicalReplay ? null : (latestPursuit?.id ?? null);
  if (!session)
    return (
      <main className="local-login">
        <span className="eyebrow">G R O U N D W O R K</span>
        <h1>Know before you bid.</h1>
        <p>
          Private local evaluation. Open your workspace with its local access
          key.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const key = value(e.currentTarget, "key");
            void action(async () => {
              await api("/session", { key });
              await refresh();
            });
          }}
        >
          <label>
            Local access key
            <input name="key" type="password" required autoComplete="off" />
          </label>
          <Button type="submit" disabled={busy}>
            Open workspace
          </Button>
        </form>
        {error && (
          <p role="alert" className="local-error">
            {error}
          </p>
        )}
        <p className="muted">
          Internal drafts only. The published prototype remains available
          separately.
        </p>
      </main>
    );
  return (
    <div className="local-shell">
      <header className="local-top">
        <a href="/local" className="local-brand">
          GROUNDWORK <span>by BidEdge</span>
        </a>
        <Badge tone="info">Local evaluation · internal drafts</Badge>
        <a href="/prototype/#/guide">Prototype guide</a>
      </header>
      <aside className="local-nav">
        <p className="eyebrow">YOUR WORKSPACE</p>
        {[
          ["pursuit", "Pursuit room"],
          ["sources", "Sources & evidence"],
          ["review", "Review queue"],
          ["operations", "Refresh & delivery"],
          ["collections", "Watchlists & briefs"],
        ].map(([id, label]) => (
          <button
            key={id}
            aria-current={tab === id ? "page" : undefined}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
        <div className="local-budget">
          <strong>Research allowance</strong>
          <p>
            {boot?.budget?.spent ?? 0} used · {boot?.budget?.reserved ?? 0}{" "}
            reserved
            <br />
            of {boot?.budget?.allowance ?? 50} included credits
          </p>
          <span className="muted">No paid fallback</span>
        </div>
      </aside>
      <main className="local-main">
        <div className="local-heading">
          <div>
            <span className="eyebrow">EVIDENCE BEFORE COMMITMENT</span>
            <h1>
              {tab === "collections"
                ? "Watchlists & briefs"
                : tab === "operations"
                  ? "Refresh & delivery"
                  : tab === "review"
                    ? "Review queue"
                    : tab === "sources"
                      ? "Sources & evidence"
                      : "Pursuit room"}
            </h1>
            <p className="lead">
              Build a clear view of the opportunity, its evidence and your next
              move.
            </p>
          </div>
          <Button kind="secondary" onClick={() => void action(refresh)}>
            Refresh
          </Button>
        </div>
        {error && (
          <div role="alert" className="local-error">
            {error}
            <button onClick={() => setError("")} aria-label="Dismiss error">
              ×
            </button>
          </div>
        )}
        {tab === "collections" ? (
          <LocalCollections
            request={api}
            clients={boot?.clients ?? []}
            onError={setError}
            onReport={(id) => void action(() => readReport(id))}
          />
        ) : tab === "operations" ? (
          <LocalOperations
            request={api}
            selected={selected}
            onError={setError}
            onReport={(id) => void action(() => readReport(id))}
          />
        ) : tab === "review" ? (
          <section className="local-card">
            <h2>Awaiting Bobby’s review</h2>
            <p>
              Review and customer publication are separate. Timeout cannot
              release a draft.
            </p>
            {boot?.reviews?.length ? (
              boot.reviews.map((r: Row) => (
                <article className="local-row" key={r.id}>
                  <strong>{r.title}</strong>
                  <Badge>{r.state}</Badge>
                  <p>
                    {r.kind} · Assigned to {r.reviewer}
                  </p>
                  <p>{r.reasons.join(" · ")}</p>
                  <p className="muted">
                    Originally supplied deadline:{" "}
                    {r.metadata?.closingAt ?? "Not supplied"}; check cited
                    amendments.
                  </p>
                  <Button
                    kind="text"
                    onClick={() =>
                      void action(async () => {
                        setSelected(r.opportunity_id ?? "");
                        await readReport(r.report_id);
                        setTab("pursuit");
                      })
                    }
                  >
                    Read draft
                  </Button>
                </article>
              ))
            ) : (
              <p>No drafts are awaiting review.</p>
            )}
          </section>
        ) : (
          <>
            <section className="local-card">
              <div className="local-section-heading">
                <h2>Your opportunities</h2>
                <span>{boot?.opportunities?.length ?? 0} saved</span>
              </div>
              {boot?.opportunities?.map((o: Row) => (
                <button
                  className={`local-opportunity ${selected === o.id ? "selected" : ""}`}
                  key={o.id}
                  onClick={() => {
                    setSelected(o.id);
                    setAssessmentCutoff("");
                    setReport(null);
                    setSource(null);
                    setSearch(null);
                    setResearchResult(null);
                  }}
                >
                  <strong>{o.title}</strong>
                  <span>
                    {o.buyer} · {o.notice_id}
                  </span>
                  <Badge>
                    {o.metadata.provenance === "synthetic"
                      ? "Synthetic fixture"
                      : "Public evidence"}
                  </Badge>
                </button>
              ))}
              <details className="local-create">
                <summary>Add an opportunity</summary>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = e.currentTarget;
                    const body = {
                      title: value(f, "title"),
                      buyer: value(f, "buyer"),
                      noticeId: value(f, "noticeId"),
                      category: value(f, "category") || "unspecified",
                      cutoff: value(f, "cutoff"),
                      clientId: value(f, "clientId") || null,
                      provenance: value(f, "provenance"),
                    };
                    void action(async () => {
                      const r = await api("/opportunities", body);
                      await refresh();
                      setSelected(r.id);
                      f.reset();
                    });
                  }}
                >
                  <div className="local-grid">
                    <label>
                      Opportunity title
                      <input name="title" required minLength={3} />
                    </label>
                    <label>
                      Buyer
                      <input name="buyer" required minLength={2} />
                    </label>
                    <label>
                      Notice reference
                      <input name="noticeId" required />
                    </label>
                    <label>
                      Category
                      <input
                        name="category"
                        placeholder="Use the award dataset category"
                      />
                    </label>
                    <label>
                      Assessment cutoff
                      <input
                        name="cutoff"
                        type="date"
                        required
                        defaultValue="2026-09-22"
                      />
                    </label>
                    <label>
                      Evidence type
                      <select name="provenance">
                        <option value="public">Public evidence</option>
                        <option value="synthetic">
                          Synthetic test fixture
                        </option>
                      </select>
                    </label>
                    <label>
                      Client context
                      <select name="clientId">
                        <option value="">
                          No client context — opportunity only
                        </option>
                        {boot?.clients?.map((c: Row) => (
                          <option key={c.id} value={c.id}>
                            {c.legal_name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <Button type="submit" disabled={busy}>
                    Save opportunity
                  </Button>
                </form>
              </details>
              <details className="local-create">
                <summary>Add client context</summary>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = e.currentTarget;
                    void action(async () => {
                      await api("/clients", {
                        legalName: value(f, "legalName"),
                        capabilities: value(f, "capabilities"),
                        certifications: value(f, "certifications"),
                        currentContracts: value(f, "contracts"),
                        effectiveDate: value(f, "effectiveDate"),
                      });
                      await refresh();
                      f.reset();
                    });
                  }}
                >
                  <label>
                    Legal entity name
                    <input name="legalName" required />
                  </label>
                  <label>
                    Declared capabilities
                    <textarea name="capabilities" required />
                  </label>
                  <div className="local-grid">
                    <label>
                      Certifications (unknown if blank)
                      <input name="certifications" />
                    </label>
                    <label>
                      Current contracts (unknown if blank)
                      <input name="contracts" />
                    </label>
                    <label>
                      Effective date
                      <input
                        name="effectiveDate"
                        type="date"
                        required
                        defaultValue="2026-09-22"
                      />
                    </label>
                  </div>
                  <Button type="submit" disabled={busy}>
                    Save client context
                  </Button>
                </form>
              </details>
            </section>
            {selected && !detail && <p role="status">Loading opportunity…</p>}
            {detail && detail.opportunity.id === selected && (
              <>
                <section className="local-card">
                  <div className="local-section-heading">
                    <div>
                      <span className="eyebrow">
                        {detail.opportunity.buyer}
                      </span>
                      <h2>{detail.opportunity.title}</h2>
                    </div>
                    <Badge>
                      As at {String(detail.opportunity.cutoff).slice(0, 10)}
                    </Badge>
                  </div>
                  <p>
                    Sources are frozen for each assessment. New documents create
                    a new version; older reports remain available.
                  </p>
                  <label>
                    Assessment cutoff for the next version
                    <input
                      type="date"
                      value={
                        assessmentCutoff ||
                        detail.reports.find((r: Row) => r.kind === "pursuit")
                          ?.payload.cutoff ||
                        detail.opportunity.cutoff
                      }
                      onChange={(e) => setAssessmentCutoff(e.target.value)}
                      required
                    />
                  </label>
                  {historicalReplay && (
                    <p>
                      This earlier cutoff starts an independent historical
                      assessment. Later reports are excluded; exclude any
                      later-dated sources using the narrower source pack below.
                    </p>
                  )}
                  <div className="local-actions">
                    <Button
                      disabled={
                        busy ||
                        detail.runs.some((r: Row) =>
                          ["queued", "running"].includes(r.state),
                        )
                      }
                      onClick={() =>
                        void action(async () => {
                          await api(`/opportunities/${selected}/runs`, {
                            cutoff: nextCutoff,
                            parentReportId: nextParentId,
                          });
                          await load(selected);
                        })
                      }
                    >
                      {detail.reports.length
                        ? "Reassess with current evidence"
                        : "Generate pursuit package"}
                    </Button>
                    <Badge>{detail.sources.length} sources</Badge>
                  </div>
                  {detail.runs.slice(0, 3).map((r: Row) => (
                    <div className="local-run" key={r.id}>
                      <div>
                        <strong>
                          {r.state === "running"
                            ? "Assessing evidence"
                            : r.state}
                        </strong>
                        <span> · {r.stage}</span>
                        {r.error && <p role="alert">{r.error}</p>}
                      </div>
                      {["queued", "running"].includes(r.state) ? (
                        <Button
                          kind="text"
                          onClick={() =>
                            void action(async () => {
                              await api(`/runs/${r.id}/cancel`, {});
                              await load(selected);
                            })
                          }
                        >
                          Cancel
                        </Button>
                      ) : (
                        ["failed", "budget-blocked"].includes(r.state) && (
                          <Button
                            kind="text"
                            onClick={() =>
                              void action(async () => {
                                await api(`/runs/${r.id}/resume`, {});
                                await load(selected);
                              })
                            }
                          >
                            Resume safely
                          </Button>
                        )
                      )}
                    </div>
                  ))}
                </section>
                <section className="local-card">
                  <h2>Source inventory</h2>
                  {!detail.sources.length && (
                    <p>
                      Add the notice first, then relevant public evidence or
                      supported documents.
                    </p>
                  )}
                  {detail.sources.map((s: Row) => (
                    <article className="local-row" key={s.id}>
                      <button
                        className="local-source-link"
                        onClick={() =>
                          void action(async () =>
                            setSource(await api(`/sources/${s.id}`)),
                          )
                        }
                      >
                        {s.name}
                      </button>
                      <Badge tone={s.state === "read" ? "success" : "warning"}>
                        {s.state}
                      </Badge>
                      <p>
                        {s.purpose} · {s.reader} · {s.coverage.read} read /{" "}
                        {s.coverage.total ?? "unknown"} {s.coverage.unit}s ·{" "}
                        {s.provenance}
                      </p>
                      {s.coverage.failures.map((f: string) => (
                        <p key={f} className="local-error">
                          {f}
                        </p>
                      ))}
                    </article>
                  ))}
                  <details className="local-create">
                    <summary>Assess an explicitly narrower source pack</summary>
                    <p>
                      Exclude only documents outside this assessment's declared
                      scope. Original coverage failures remain recorded. This
                      cannot certify the full pack as reviewed.
                    </p>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const f = new FormData(e.currentTarget);
                        void action(async () => {
                          await api("/opportunities/" + selected + "/runs", {
                            cutoff: nextCutoff,
                            parentReportId: nextParentId,
                            excludedSourceIds: f.getAll("exclude"),
                            scopeNote: String(f.get("scopeNote") ?? ""),
                          });
                          await load(selected);
                        });
                      }}
                    >
                      {detail.sources.map((s: Row) => (
                        <label className="local-check" key={s.id}>
                          <input type="checkbox" name="exclude" value={s.id} />
                          Exclude {s.name}
                        </label>
                      ))}
                      <label>
                        Assessment scope and reason for exclusions
                        <textarea name="scopeNote" required minLength={10} />
                      </label>
                      <Button
                        type="submit"
                        disabled={
                          busy ||
                          detail.runs.some((r: Row) =>
                            ["queued", "running"].includes(r.state),
                          )
                        }
                      >
                        Assess this declared scope
                      </Button>
                    </form>
                  </details>
                  <details className="local-create">
                    <summary>Add source text, a URL or a document</summary>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const f = e.currentTarget;
                        const file = (
                          f.elements.namedItem("file") as HTMLInputElement
                        ).files?.[0];
                        void action(async () => {
                          if (file) {
                            const data = new FormData();
                            for (const name of [
                              "purpose",
                              "publishedAt",
                              "provenance",
                            ])
                              data.append(name, value(f, name));
                            data.append(
                              "required",
                              String(
                                (
                                  f.elements.namedItem(
                                    "required",
                                  ) as HTMLInputElement
                                ).checked,
                              ),
                            );
                            data.append("rightsConfirmed", "true");
                            data.append("file", file);
                            await api(
                              `/opportunities/${selected}/upload`,
                              data,
                            );
                          } else {
                            await api(`/opportunities/${selected}/sources`, {
                              name: value(f, "name"),
                              mediaType: "text/plain",
                              text: value(f, "text") || undefined,
                              url: value(f, "url") || undefined,
                              purpose: value(f, "purpose"),
                              publishedAt: value(f, "publishedAt") || null,
                              required: (
                                f.elements.namedItem(
                                  "required",
                                ) as HTMLInputElement
                              ).checked,
                              provenance: value(f, "provenance"),
                              rightsConfirmed: true,
                            });
                          }
                          await load(selected);
                          f.reset();
                        });
                      }}
                    >
                      <div className="local-grid">
                        <label>
                          Source name
                          <input name="name" />
                        </label>
                        <label>
                          Purpose
                          <select name="purpose">
                            {[
                              "notice",
                              "context",
                              "awards",
                              "rfp",
                              "addendum",
                              "client",
                            ].map((p) => (
                              <option key={p}>{p}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Publication date (if known)
                          <input type="date" name="publishedAt" />
                        </label>
                        <label>
                          Evidence type
                          <select name="provenance">
                            <option value="public">Public</option>
                            <option value="synthetic">Synthetic fixture</option>
                          </select>
                        </label>
                      </div>
                      <label>
                        Permitted public URL
                        <input name="url" type="url" placeholder="https://" />
                      </label>
                      <label>
                        Or paste source text
                        <textarea name="text" rows={5} />
                      </label>
                      <label>
                        Or upload a document
                        <input name="file" type="file" />
                      </label>
                      <label className="local-check">
                        <input type="checkbox" name="required" defaultChecked />
                        Required for this assessment
                      </label>
                      <label className="local-check">
                        <input type="checkbox" required />I have permission to
                        use this public or synthetic material.
                      </label>
                      <Button disabled={busy} type="submit">
                        Save & read source
                      </Button>
                    </form>
                  </details>
                  <details className="local-create">
                    <summary>Find public context</summary>
                    <p>
                      Search up to five web results using two included credits.
                      Search results are leads; add a permitted source to the
                      pack before citing it.
                    </p>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const query = value(e.currentTarget, "webQuery");
                        void action(async () => {
                          setResearchResult(
                            await api(`/opportunities/${selected}/research`, {
                              query,
                            }),
                          );
                          await refresh();
                        });
                      }}
                    >
                      <label>
                        Public research query
                        <input
                          name="webQuery"
                          required
                          minLength={3}
                          maxLength={300}
                          placeholder="Buyer, category and question"
                        />
                      </label>
                      <Button kind="secondary" type="submit" disabled={busy}>
                        Find public sources
                      </Button>
                    </form>
                    {researchResult && (
                      <div>
                        {researchResult.data?.web?.length ? (
                          researchResult.data.web.map((lead: Row) => (
                            <article className="local-row" key={lead.url}>
                              <a
                                href={lead.url}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {lead.title ?? lead.url}
                              </a>
                              <p>{lead.description}</p>
                              <small>Unverified search lead</small>
                            </article>
                          ))
                        ) : (
                          <p>
                            No results in this bounded search. This does not
                            establish absence.
                          </p>
                        )}
                      </div>
                    )}
                  </details>
                  <form
                    className="local-search"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const query = value(e.currentTarget, "query");
                      void action(async () =>
                        setSearch(
                          await api(`/opportunities/${selected}/search`, {
                            query,
                          }),
                        ),
                      );
                    }}
                  >
                    <label>
                      Search this source pack
                      <input
                        name="query"
                        required
                        placeholder="Exact term or phrase"
                      />
                    </label>
                    <Button kind="secondary" type="submit" disabled={busy}>
                      Search evidence
                    </Button>
                  </form>
                  {search && (
                    <div>
                      <Badge>{search.state.replaceAll("_", " ")}</Badge>
                      <p>{search.scope}</p>
                      {search.sources.map((s: Row) => (
                        <p key={s.sourceId}>
                          {s.hits.length} matches · {s.visitedUnitIds.length}{" "}
                          units visited · {s.state}
                        </p>
                      ))}
                    </div>
                  )}
                </section>
                <section className="local-card">
                  <h2>Saved reports</h2>
                  {detail.reports.some((r: Row) => r.kind === "pursuit") && (
                    <Button
                      kind="secondary"
                      disabled={busy}
                      onClick={() =>
                        void action(async () => {
                          const parent = detail.reports.find(
                            (r: Row) => r.kind === "pursuit",
                          );
                          for (const kind of [
                            "watchlist",
                            "competitor",
                            "weekly",
                          ])
                            await api("/reports/" + parent.id + "/derive", {
                              kind,
                            });
                          await load(selected);
                          await refresh();
                        })
                      }
                    >
                      Create watchlist, profile and weekly brief
                    </Button>
                  )}
                  {!detail.reports.length ? (
                    <p>
                      Completed drafts will appear here. Failed runs cannot
                      replace a report.
                    </p>
                  ) : (
                    detail.reports.map((r: Row) => (
                      <button
                        className="local-opportunity"
                        key={r.id}
                        onClick={() => void action(() => readReport(r.id))}
                      >
                        <strong>
                          {
                            (
                              {
                                pursuit: "Pursuit package",
                                watchlist: "Daily watchlist",
                                competitor: "Competitor profile",
                                weekly: "Weekly brief",
                              } as Row
                            )[r.kind]
                          }
                        </strong>
                        <span>
                          {new Date(r.created_at).toLocaleString()} ·{" "}
                          {r.payload.assessment?.verdict.recommendation}
                        </span>
                        <Badge>
                          {r.payload.evaluation === "fixture"
                            ? "Fixture"
                            : "Live analysis"}{" "}
                          ·{" "}
                          {r.payload.sourceInventory?.some(
                            (s: Row) => s.provenance === "synthetic",
                          )
                            ? "Synthetic evidence"
                            : "Public evidence"}{" "}
                          · Internal draft
                        </Badge>
                      </button>
                    ))
                  )}
                </section>
              </>
            )}
          </>
        )}
        {report && (
          <ReportView
            report={report}
            busy={busy}
            onEvidence={(id) => void action(() => readEvidence(id))}
            onFeedback={(target, disposition, reason) =>
              void action(async () => {
                await api(`/reports/${report.id}/feedback`, {
                  target,
                  disposition,
                  reason,
                });
                await readReport(report.id);
              })
            }
            onOutcome={(outcome) =>
              void action(async () => {
                await api("/reports/" + report.id + "/outcomes", outcome);
                await readReport(report.id);
              })
            }
            onReview={(state, reason) =>
              void action(async () => {
                await api(`/reports/${report.id}/review`, { state, reason });
                await readReport(report.id);
                await refresh();
              })
            }
            onDeliver={() =>
              void action(async () => {
                await api(`/reports/${report.id}/deliver-local`, {});
                await readReport(report.id);
              })
            }
            onDecision={(choice, reason) =>
              void action(async () => {
                await api(`/reports/${report.id}/decision`, { choice, reason });
                await readReport(report.id);
              })
            }
          />
        )}
        {source && (
          <section
            className="local-card local-evidence"
            aria-label="Source evidence"
          >
            <div className="local-section-heading">
              <h2>{source.name}</h2>
              <Button kind="text" onClick={() => setSource(null)}>
                Close evidence
              </Button>
            </div>
            <p>
              {source.reader} · {source.state} · {source.provenance}
            </p>
            <a href={`/api/sources/${source.id}/download`}>
              Download frozen original
            </a>
            {source.units.map((u: Row) => (
              <article
                key={u.id}
                className={u.id === source.selectedUnit ? "cited-unit" : ""}
              >
                <strong>{u.location}</strong>
                <pre>{u.text}</pre>
              </article>
            ))}
          </section>
        )}
      </main>
    </div>
  );
}
function ReportView({
  report,
  busy,
  onEvidence,
  onFeedback,
  onDecision,
  onReview,
  onDeliver,
  onOutcome,
}: {
  report: Row;
  busy: boolean;
  onEvidence: (id: string) => void;
  onFeedback: (target: string, disposition: string, reason: string) => void;
  onDecision: (choice: string, reason: string) => void;
  onReview: (state: string, reason: string) => void;
  onDeliver: () => void;
  onOutcome: (outcome: unknown) => void;
}) {
  const p = report.payload as VerifiedReport;
  const a = p.assessment;
  if (!a) return null;
  const claim = (id: string) => a.claims.find((c) => c.id === id);
  const evidenceFor = (id: string, seen = new Set<string>()): string[] => {
    if (seen.has(id)) return [];
    seen.add(id);
    const c = claim(id);
    return c
      ? [
          ...new Set([
            ...c.evidenceIds,
            ...c.premiseIds.flatMap((p) => evidenceFor(p, seen)),
          ]),
        ]
      : [];
  };
  const verification = (id: string) =>
    ({
      VERBATIM: "Exact quote",
      VERBATIM_MODULO_SPACING: "Quote with spacing normalized",
      NOT_FOUND: "Quote not found",
      UNVERIFIED_NOT_MACHINE_CHECKABLE: "Not mechanically checked",
    })[p.quoteStates[id]] ?? p.quoteStates[id];
  const render = (id: string) => {
    const c = claim(id);
    return c ? (
      <div>
        <p>{c.text}</p>
        <div className="local-citations">
          <Badge>{c.provenance}</Badge>
          {evidenceFor(c.id).map((eid) => {
            const e = a.evidence.find((e) => e.id === eid)!;
            return (
              <button key={eid} onClick={() => onEvidence(e.unitId)}>
                {eid} · {verification(eid)}
              </button>
            );
          })}
        </div>
      </div>
    ) : (
      <p>Claim unavailable</p>
    );
  };
  return (
    <article className="local-report">
      <header>
        <span className="eyebrow">
          {report.kind.toUpperCase()} · INTERNAL DRAFT
        </span>
        <h2>A considered view. An evidence trail.</h2>
        <Badge tone="info">{a.verdict.recommendation}</Badge>
        <p>
          {a.verdict.posture} posture · {p.evaluation} model analysis ·{" "}
          {report.payload.sourceInventory?.some(
            (s: Row) => s.provenance === "synthetic",
          )
            ? "Synthetic evidence"
            : "Public evidence"}{" "}
          · {new Date(report.created_at).toLocaleString()}
        </p>
      </header>
      {(report.review?.state === "changes-requested" ||
        report.freshness?.upstreamReviewState === "changes-requested") && (
        <p className="local-error">
          Corrections are requested for this report or its underlying
          assessment. Review the recorded reasons before relying on it.
        </p>
      )}
      {report.freshness?.stale && (
        <p className="local-error">
          New evidence or a newer assessment is available. This frozen version
          is stale.
        </p>
      )}
      {report.payload.deliverable && (
        <EnrichedSections
          data={report.payload.deliverable}
          comparison={report.comparison}
          renderClaim={render}
        />
      )}
      <section>
        <details>
          <summary>Shared intelligence snapshot</summary>
          <p>Assessment cutoff: {report.payload.cutoff}</p>
          <p>
            Incumbent:{" "}
            {report.payload.intelligence?.incumbent?.entityName ?? "Unknown"} ·{" "}
            {report.payload.intelligence?.incumbent?.status?.replaceAll(
              "_",
              " ",
            )}
          </p>
          <p>
            Client relationship:{" "}
            {report.payload.intelligence?.incumbent?.clientRelationship ??
              "unknown"}
          </p>
          <p>
            Supplier names:{" "}
            {report.payload.intelligence?.entities
              ?.map((e: Row) => e.name)
              .join(", ") || "None established"}
          </p>
          <p>
            {report.payload.intelligence?.metrics?.awardCount ?? 0} records in
            the admitted award population. Retention and repeat-supplier
            frequency remain separate.
          </p>
          {report.payload.intelligence?.entityEvidence?.observations?.map(
            (o: Row) => (
              <article className="local-row" key={o.id}>
                <strong>
                  {o.entityName} · {o.kind.replaceAll("_", " ")}
                </strong>
                <p>“{o.quote}”</p>
                <Button kind="text" onClick={() => onEvidence(o.unitId)}>
                  Open entity evidence
                </Button>
              </article>
            ),
          )}
          {report.payload.intelligence?.limitations?.map((l: string) => (
            <p className="muted" key={l}>
              {l}
            </p>
          ))}
        </details>
      </section>
      <details open={report.kind === "pursuit"}>
        <summary>Underlying pursuit assessment</summary>
        <section>
          {report.review?.state === "changes-requested" && (
            <p className="local-error">
              Correction requested. Read the review notes before relying on this
              version.
            </p>
          )}
          <h3>Executive summary</h3>
          {p.summarySentences.map((s, i) => (
            <p key={i}>{s}</p>
          ))}
          <div className="local-citations" aria-label="Summary evidence">
            {[
              ...new Set(
                Object.values(a.summary).flatMap((id) => evidenceFor(id)),
              ),
            ].map((eid) => {
              const evidence = a.evidence.find((e) => e.id === eid)!;
              return (
                <button key={eid} onClick={() => onEvidence(evidence.unitId)}>
                  {eid} · {verification(eid)}
                </button>
              );
            })}
          </div>
        </section>
        <section>
          <h3>Centre of gravity</h3>
          {render(a.centreOfGravity.factorClaimId)}
          <h4>What this means</h4>
          {render(a.centreOfGravity.implicationClaimId)}
          <h4>What you can do</h4>
          {render(a.centreOfGravity.actionClaimId)}
        </section>
        <section>
          <h3>Cone of plausibility</h3>
          <div className="local-scenarios">
            {a.scenarios.map((s) => (
              <article key={s.name}>
                <h4>{s.name}</h4>
                {render(s.outcomeClaimId)}
                <strong>Indicators</strong>
                <ul>
                  {s.indicators.map((i) => (
                    <li key={i}>{i}</li>
                  ))}
                </ul>
                <p className="muted">Assumptions: {s.assumptions.join("; ")}</p>
              </article>
            ))}
          </div>
        </section>
        <section>
          <h3>Competing hypotheses</h3>
          <p>
            {a.hypotheses.event} · {a.hypotheses.timeframe}
          </p>
          <p className="muted">
            Numerical policy pending. These are alternatives, not calibrated
            probabilities.
          </p>
          {a.hypotheses.alternatives.map((h) => (
            <article className="local-row" key={h.id}>
              <h4>{h.statement}</h4>
              <p>{h.diagnosticRationale}</p>
              <p>
                Supporting: {h.supportingEvidenceIds.join(", ") || "None"} ·
                Contradicting: {h.contradictingEvidenceIds.join(", ") || "None"}
              </p>
            </article>
          ))}
          <strong>Next evidence to collect</strong>
          <p>{a.hypotheses.nextCollection}</p>
        </section>
        <section>
          <h3>Risk register</h3>
          {a.risks.map((r) => (
            <article className="local-row" key={r.id}>
              {render(r.claimId)}
              <p>
                <strong>{r.likelihood}</strong> — {r.likelihoodRationale}
              </p>
              <p>
                <strong>Impact:</strong> {r.impact}
              </p>
              <p>
                <strong>Watch for:</strong> {r.trigger}
              </p>
              <strong>Action</strong>
              {render(r.mitigationClaimId)}
            </article>
          ))}
        </section>
        <section>
          <h3>Evidence and limitations</h3>
          <ul>
            {p.limitations.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
          <details>
            <summary>All claims and support checks</summary>
            {a.claims.map((c) => (
              <article className="local-row" key={c.id}>
                {render(c.id)}
                <p className="muted">
                  {p.support.find((s) => s.claimId === c.id)?.support} ·{" "}
                  {p.support.find((s) => s.claimId === c.id)?.rationale}
                </p>
                {c.duplicateOf && (
                  <p>Duplicate of {c.duplicateOf}; preserved.</p>
                )}
              </article>
            ))}
          </details>
        </section>
      </details>
      {report.comparison && (
        <section>
          <h3>Changes since the previous report</h3>
          {report.comparison.map((c: Row, i: number) => (
            <p key={i}>
              <Badge>{c.status.replaceAll("_", " ")}</Badge>
              <br />
              {c.previousText && (
                <>
                  Before: {c.previousText}
                  <br />
                </>
              )}
              {c.currentText && <>Now: {c.currentText}</>}
              {c.status === "ABSENT_FROM_THIS_RUN" && (
                <>
                  Not repeated in this assessment; closure is not established.
                </>
              )}
            </p>
          ))}
        </section>
      )}
      {(p.requirements as Row)?.status === "complete" && (
        <section>
          <h3>Systematic requirements review</h3>
          <p>
            {(p.requirements as Row).candidatesJudged} /{" "}
            {(p.requirements as Row).candidatesProduced} candidates judged
            across {(p.requirements as Row).unitsEnumerated} units.
          </p>
          <p className="muted">{(p.requirements as Row).limitation}</p>
          {(p.requirements as Row).judgments.flatMap((j: Row) =>
            j.requirements.map((r: Row, i: number) => (
              <article className="local-row" key={j.candidateId + i}>
                <strong>{r.text}</strong>
                <p>“{r.quote}”</p>
                <p>{r.rationale}</p>
                <Button
                  kind="text"
                  onClick={() =>
                    onEvidence(j.candidateId.replace("candidate-", ""))
                  }
                >
                  Open requirement evidence
                </Button>
              </article>
            )),
          )}
        </section>
      )}
      <section>
        <h3>Internal review and delivery</h3>
        <p>
          Assigned to Bobby. Recorded by the signed-in local reviewer; this does
          not publish to customers.
        </p>
        <Badge>{report.review?.state ?? "pending"}</Badge>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onReview(
              value(e.currentTarget, "state"),
              value(e.currentTarget, "reason"),
            );
          }}
        >
          <label>
            Review decision
            <select name="state">
              <option value="approved">Approve for internal delivery</option>
              <option value="changes-requested">Request corrections</option>
            </select>
          </label>
          <label>
            Review reason
            <textarea name="reason" required minLength={3} />
          </label>
          <Button type="submit" disabled={busy}>
            Record review
          </Button>
        </form>
        {report.reviewHistory?.map((r: Row) => (
          <p key={r.id}>
            {r.state} · {r.reason} · {new Date(r.created_at).toLocaleString()}
          </p>
        ))}
        <Button
          kind="secondary"
          disabled={
            busy ||
            report.review?.state !== "approved" ||
            report.freshness?.stale ||
            report.freshness?.upstreamReviewState !== "approved"
          }
          onClick={onDeliver}
        >
          Deliver to local inbox
        </Button>
        <p className="muted">
          Delivery requires this version and its underlying pursuit to be
          approved and current. No timeout release.
        </p>
      </section>
      <section>
        <h3>Your decision</h3>
        <p>Your decision stays separate from the assessment.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onDecision(
              value(e.currentTarget, "choice"),
              value(e.currentTarget, "reason"),
            );
          }}
        >
          <select name="choice">
            <option value="pursue">Pursue</option>
            <option value="watch">Watch</option>
            <option value="pass">Pass</option>
          </select>
          <label>
            Reason
            <textarea name="reason" required />
          </label>
          <Button type="submit" disabled={busy}>
            Record decision
          </Button>
        </form>
        {report.decisions?.map((d: Row) => (
          <p key={d.id}>
            {d.choice}: {d.reason}
          </p>
        ))}
      </section>
      <section>
        <h3>Observed outcome</h3>
        <p>
          Record an observed event with evidence separately from the
          recommendation and your decision.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onOutcome({
              event: value(e.currentTarget, "event"),
              outcome: value(e.currentTarget, "outcome"),
              observedAt: value(e.currentTarget, "date"),
              unitId: value(e.currentTarget, "unit"),
            });
          }}
        >
          <label>
            Event being tracked
            <input name="event" required minLength={3} />
          </label>
          <label>
            Observed result
            <textarea name="outcome" required minLength={3} />
          </label>
          <label>
            Observation date
            <input name="date" type="date" required />
          </label>
          <label>
            Evidence unit
            <select name="unit" required>
              <option value="">Choose cited evidence</option>
              {a.evidence.map((e) => (
                <option key={e.id} value={e.unitId}>
                  {e.id}: {e.excerpt.slice(0, 90)}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" disabled={busy}>
            Record sourced outcome
          </Button>
        </form>
        {report.outcomes?.map((o: Row) => (
          <article key={o.id}>
            <p>
              {o.event}: {o.outcome} · {o.observed_at}
            </p>
            <Button kind="text" onClick={() => onEvidence(o.unit_id)}>
              Open outcome evidence
            </Button>
          </article>
        ))}
      </section>
      <section>
        <h3>Reviewer feedback</h3>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onFeedback(
              value(e.currentTarget, "target"),
              value(e.currentTarget, "disposition"),
              value(e.currentTarget, "reason"),
            );
          }}
        >
          <div className="local-grid">
            <label>
              Target
              <select name="target">
                <option value="report">Whole report</option>
                {a.claims.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.id}: {c.text.slice(0, 70)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Feedback
              <select name="disposition">
                {["accept", "reject", "correction", "unclear"].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Reason
            <textarea name="reason" required />
          </label>
          <Button type="submit" disabled={busy}>
            Save feedback
          </Button>
        </form>
        {report.feedback?.map((f: Row) => (
          <p key={f.id}>
            {f.disposition} · {f.reason}
            {f.before_text && (
              <>
                <br />
                Before: {f.before_text}
              </>
            )}
            {f.after_text && (
              <>
                <br />
                Proposed correction: {f.after_text}
              </>
            )}
          </p>
        ))}
      </section>
    </article>
  );
}
