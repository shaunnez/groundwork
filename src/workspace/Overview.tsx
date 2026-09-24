import { useState } from "react";
import { Badge, Button, Empty, I, Search } from "../ui";
import { clientJourney } from "../Home";
import { Heading } from "./Chrome";
import { GetsIntakePanel } from "./GetsIntakePanel";
import { watchlistPreview } from "./watchlist-preview";
import {
  date,
  kindLabel,
  provenance,
  type Bootstrap,
  type ReportSummary,
  type Navigate,
  type Opportunity,
} from "./data";
export function HomeView({
  boot,
  reports,
  go,
}: {
  boot: Bootstrap;
  reports: ReportSummary[];
  go: Navigate;
}) {
  const latest = reports.find((r) => r.kind === "pursuit"),
    next =
      boot.opportunities.find((o) => o.id === latest?.opportunity_id) ||
      boot.opportunities[0];
  return (
    <>
      <section className="dashboard-hero">
        <div>
          <span className="eyebrow">
            GROUNDWORK BY BIDEDGE · YOUR FIRM WORKSPACE
          </span>
          <h1>A clearer view of your next bid.</h1>
          <p className="lead">
            Start with what deserves attention, understand the competition, and
            decide where to commit your team.
          </p>
          <Button onClick={() => go("watchlist")}>
            Explore your watchlist <I.ArrowRight size={18} />
          </Button>
        </div>
        <aside>
          <span className="eyebrow">WHAT IS GROUNDWORK?</span>
          <h2>Procurement intelligence from BidEdge.</h2>
          <p>
            Opportunities, buyer and competitor research, and your firm’s
            evidence in one place. Each pursuit explains what the evidence
            supports and what you still need to check.
          </p>
          <span className="small">Your team owns the bid decision.</span>
        </aside>
      </section>
      <p className="dashboard-asof">
        Your saved workspace · Reports retain their assessment date · Synthetic
        evaluations are labelled
      </p>
      <div className="dashboard-metrics">
        {[
          {
            label: "Tracked opportunities",
            value: boot.opportunities.length,
            page: "watchlist" as const,
            detail: "Your shortlist for closer review",
          },
          {
            label: "Pursuit report versions",
            value: reports.filter((r) => r.kind === "pursuit").length,
            page: "reports" as const,
            detail: "Original findings stay available",
          },
          {
            label: "Firm profiles",
            value: boot.clients.length,
            page: "firm" as const,
            detail: "Your supplied context, kept separate",
          },
        ].map((m) => (
          <button
            className="dashboard-metric"
            key={m.label}
            onClick={() => go(m.page)}
          >
            <span>
              {m.label}
              <I.ArrowRight size={18} />
            </span>
            <strong>{m.value}</strong>
            <small>{m.detail}</small>
          </button>
        ))}
      </div>
      <section className="dashboard-attention">
        <div>
          <span className="eyebrow">YOUR NEXT STEP</span>
          <h2>{next?.title || "Build your first pursuit"}</h2>
          <p className="muted">
            {next?.buyer || "Start with a notice and the evidence behind it."}
          </p>
          {latest && (
            <>
              <Badge tone="info">{latest.verdict.recommendation}</Badge>
              <p>{latest.summary[0]}</p>
            </>
          )}
          <Button onClick={() => go(next ? "pursuit" : "watchlist", next?.id)}>
            {next ? "Continue this pursuit" : "Add an opportunity"}
            <I.ArrowRight size={17} />
          </Button>
        </div>
        <div>
          <span className="eyebrow">IN YOUR WORKSPACE</span>
          <h3>Your latest assessment</h3>
          <p>
            {latest
              ? `${date(latest.created_at)} · ${kindLabel[latest.kind]} · Internal draft`
              : "Your saved assessments will appear here."}
          </p>
          {latest && (
            <Button
              kind="text"
              onClick={() => go("report", latest.opportunity_id, latest.id)}
            >
              Read the report <I.ArrowRight size={16} />
            </Button>
          )}
          <hr />
          <h3>Your weekly brief</h3>
          <p>
            Changes, competitive context and next steps across your tracked
            opportunities.
          </p>
          <Button kind="text" onClick={() => go("brief")}>
            Read your weekly brief <I.ArrowRight size={16} />
          </Button>
        </div>
      </section>
      <section className="section-gap">
        <span className="eyebrow">FROM OPPORTUNITY TO DECISION</span>
        <h2>How to use your workspace</h2>
        <div className="journey-grid">
          {clientJourney.map((step, i) => (
            <article key={step.title}>
              <span className="journey-number">0{i + 1}</span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
              <Button
                kind="text"
                onClick={() =>
                  go(step.screen as Parameters<Navigate>[0], next?.id)
                }
              >
                Open {step.title.toLowerCase()} step <I.ArrowRight size={16} />
              </Button>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
export function WatchlistView({
  boot,
  reports,
  go,
  onAdd,
  onImported,
  onEvidence,
}: {
  boot: Bootstrap;
  reports: ReportSummary[];
  go: Navigate;
  onAdd: () => void;
  onImported: () => Promise<void>;
  onEvidence: (sourceId: string, quote: string) => void;
}) {
  const [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all"),
    [client, setClient] = useState(""),
    [sector, setSector] = useState(""),
    [visible, setVisible] = useState(25);
  const sectorOptions = [
    ...new Map(
      boot.opportunities
        .filter((o) => o.groundwork_sector_id)
        .map((o) => [
          o.groundwork_sector_id,
          o.groundwork_sector_name || "Sector",
        ]),
    ).entries(),
  ];
  const latest = (o: Opportunity) =>
    reports.find((r) => r.kind === "pursuit" && r.opportunity_id === o.id);
  const rows = boot.opportunities.filter(
    (o) =>
      [
        o.title,
        o.buyer,
        o.notice_id,
        o.metadata.category,
        ...(o.metadata.categories || []),
        ...(o.metadata.regions || []),
      ]
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (!client || o.client_id === client) &&
      (!sector ||
        (sector === "unknown"
          ? !o.groundwork_sector_id
          : o.groundwork_sector_id === sector)) &&
      (filter === "all" ||
        (filter === "assessed" ? Boolean(latest(o)) : !latest(o))),
  );
  return (
    <>
      <Heading
        go={go}
        eyebrow="YOUR OPPORTUNITY WATCHLIST"
        title="Focus on the right opportunities."
        description="Your tracked government work, evidence-backed assessments and a clearer next step."
        actions={
          <Button
            kind="secondary"
            onClick={onAdd}
            disabled={boot.role === "reviewer"}
          >
            <I.Plus size={16} />
            Add opportunity
          </Button>
        }
      />
      <GetsIntakePanel owner={boot.role === "owner"} onImported={onImported} />
      <div className="watchlist-summary">
        <span>
          <I.Circle size={8} weight="fill" /> Saved opportunities
        </span>
        <button onClick={() => go("brief")}>
          Read your weekly brief <I.ArrowRight size={15} />
        </button>
      </div>
      <div className="filter-row watchlist-filters">
        <div className="segmented">
          {[
            ["all", "Tracked"],
            ["assessed", "Assessed"],
            ["pending", "Needs assessment"],
          ].map(([id, label]) => (
            <button
              key={id}
              className={filter === id ? "active" : ""}
              aria-pressed={filter === id}
              onClick={() => {
                setFilter(id);
                setVisible(25);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <Search
          value={search}
          onChange={(value) => {
            setSearch(value);
            setVisible(25);
          }}
          placeholder="Search title, buyer, category or region"
        />
        <select
          aria-label="Filter by firm"
          value={client}
          onChange={(e) => {
            setClient(e.target.value);
            setVisible(25);
          }}
        >
          <option value="">All firm profiles</option>
          {boot.clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.legal_name}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by Groundwork sector"
          value={sector}
          onChange={(e) => {
            setSector(e.target.value);
            setVisible(25);
          }}
        >
          <option value="">All Groundwork sectors</option>
          <option value="unknown">Unknown</option>
          {sectorOptions.map(([id, name]) => (
            <option key={id} value={id!}>
              {name}
            </option>
          ))}
        </select>
      </div>
      <div className="list-heading">
        <strong>{rows.length} tracked opportunities</strong>
        <span>
          Showing {Math.min(visible, rows.length)} · each assessment retains its
          evidence
        </span>
      </div>
      {!rows.length ? (
        <Empty
          title="No matching opportunities"
          description="Add a notice or adjust your filters to start a pursuit."
          action={
            <Button onClick={onAdd} disabled={boot.role === "reviewer"}>
              Add opportunity
            </Button>
          }
        />
      ) : (
        <div className="opportunity-list">
          {rows.slice(0, visible).map((o) => {
            const r = latest(o);
            const preview = watchlistPreview(o, r);
            const brief = !r ? o.notice_brief : null;
            const citation = (unitId: string, quote: string) =>
              o.notice_brief_source_id && (
                <button
                  className="notice-citation"
                  onClick={() => onEvidence(unitId, quote)}
                >
                  View saved notice wording
                </button>
              );
            return (
              <article className="opportunity-row" key={o.id}>
                <div>
                  <div className="eyebrow">{o.buyer}</div>
                  <button
                    className="opportunity-title"
                    onClick={() => go("pursuit", o.id)}
                  >
                    {o.title}
                  </button>
                  <p className="small muted">
                    {o.notice_id} · {provenance(o)} · Groundwork sector:{" "}
                    {o.groundwork_sector_name || "Unknown"}
                  </p>
                  <div className="watch-intelligence">
                    <div className="watch-intelligence-main">
                      <h3>Intelligence summary</h3>
                      <p>
                        {brief?.summary.text || preview.summary}{" "}
                        {brief &&
                          citation(brief.summary.unitId, brief.summary.quote)}
                      </p>
                      <div className="watch-framing">
                        <h3>Decisive factor</h3>
                        {r ? (
                          <p>
                            <strong>{preview.framing}</strong>
                          </p>
                        ) : (
                          <p>Not established from the notice alone.</p>
                        )}
                      </div>
                      {!r && (
                        <div className="watch-framing">
                          <h3>Why the scope may matter</h3>
                          <p>
                            {brief?.whyItMayMatter.text || preview.framing}{" "}
                            {brief &&
                              citation(
                                brief.whyItMayMatter.unitId,
                                brief.whyItMayMatter.quote,
                              )}
                          </p>
                        </div>
                      )}
                    </div>
                    <div className="watch-flags">
                      <h3>Red flags &amp; unknowns</h3>
                      {brief?.redFlags.length || preview.flags.length ? (
                        <ul>
                          {(brief
                            ? brief.redFlags.map((item) => item.text)
                            : preview.flags
                          ).map((flag, index) => (
                            <li key={`${index}:${flag}`}>
                              {flag}{" "}
                              {brief &&
                                citation(
                                  brief.redFlags[index].unitId,
                                  brief.redFlags[index].quote,
                                )}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p>
                          Read the full notice and assessment for remaining
                          uncertainties.
                        </p>
                      )}
                    </div>
                    {preview.competitors.length > 0 && (
                      <div className="watch-competitors">
                        <h3>Potential competitors to check</h3>
                        <div className="watch-competitor-cards">
                          {preview.competitors.map((name) => (
                            <span className="watch-competitor-card" key={name}>
                              {name}
                            </span>
                          ))}
                        </div>
                        <small>
                          Named in saved evidence; bidding intentions are
                          unconfirmed.
                        </small>
                      </div>
                    )}
                    <small className="watch-basis">
                      {brief
                        ? "Saved public-notice brief · attachments not examined · full pursuit not assessed"
                        : preview.basis}
                      {o.metadata.noticeUrl && (
                        <>
                          {" "}
                          ·{" "}
                          <a
                            href={o.metadata.noticeUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Original notice <I.Link size={12} />
                          </a>
                        </>
                      )}
                    </small>
                  </div>
                </div>
                <div className="row-end">
                  <span className="watch-deadline-label">
                    {o.metadata.noticeType || "Notice type unrecorded"}
                  </span>
                  <strong className="watch-deadline">{preview.deadline}</strong>
                  <Badge tone={r ? "info" : "warning"}>
                    {r?.verdict.recommendation || "Not assessed"}
                  </Badge>
                  <span className="small muted">
                    {r ? `Assessed ${date(r.cutoff)}` : "Evidence needed"}
                  </span>
                  <Button kind="text" onClick={() => go("pursuit", o.id)}>
                    Open pursuit <I.ArrowRight size={16} />
                  </Button>
                </div>
                <div className="watch-actions">
                  <h3>Three recommended actions</h3>
                  <ol>
                    {(brief
                      ? brief.actions.map((item) => item.text)
                      : preview.actions
                    ).map((action, index) => (
                      <li key={`${index}:${action}`}>
                        {action}{" "}
                        {brief &&
                          citation(
                            brief.actions[index].unitId,
                            brief.actions[index].quote,
                          )}
                      </li>
                    ))}
                  </ol>
                </div>
              </article>
            );
          })}
        </div>
      )}
      {rows.length > visible && (
        <div className="watchlist-more">
          <Button
            kind="secondary"
            onClick={() => setVisible((count) => count + 25)}
          >
            Show more opportunities ({rows.length - visible} remaining)
          </Button>
        </div>
      )}
    </>
  );
}
export function LibraryView({
  boot,
  reports,
  go,
}: {
  boot: Bootstrap;
  reports: ReportSummary[];
  go: Navigate;
}) {
  const [search, setSearch] = useState(""),
    [kind, setKind] = useState("all");
  const rows = reports.filter(
    (r) =>
      (kind === "all" || r.kind === kind) &&
      (boot.opportunities.find((o) => o.id === r.opportunity_id)?.title || "")
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <>
      <Heading
        go={go}
        eyebrow="YOUR REPORT LIBRARY"
        title="Intelligence you can return to."
        description="Every saved version keeps the evidence and reasoning used at the time."
        actions={
          <Button kind="secondary" onClick={() => go("brief")}>
            Weekly brief
          </Button>
        }
      />
      <div className="filter-row">
        <Search
          value={search}
          onChange={setSearch}
          placeholder="Search reports"
        />
        <select
          aria-label="Report type"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
        >
          <option value="all">All report types</option>
          {Object.entries(kindLabel).map(([id, label]) => (
            <option value={id} key={id}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div className="list-heading">
        <strong>{rows.length} saved versions</strong>
        <span>Internal drafts · review status stays visible</span>
      </div>
      {!rows.length ? (
        <Empty
          title={reports.length ? "No matching reports" : "No reports yet"}
          description={
            reports.length
              ? "Try another search or report type. Your saved versions are still available."
              : "Choose an opportunity and request its first pursuit assessment."
          }
          action={
            reports.length ? (
              <Button
                onClick={() => {
                  setSearch("");
                  setKind("all");
                }}
              >
                Clear filters
              </Button>
            ) : (
              <Button onClick={() => go("watchlist")}>Open watchlist</Button>
            )
          }
        />
      ) : (
        <div className="table-scroll">
          <table className="data-table connected-table report-table">
            <caption className="sr-only">Saved report versions</caption>
            <thead>
              <tr>
                <th scope="col">Report</th>
                <th scope="col">Type</th>
                <th scope="col">Saved</th>
                <th scope="col">Review</th>
                <th scope="col">
                  <span className="sr-only">Action</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const o = boot.opportunities.find(
                  (o) => o.id === r.opportunity_id,
                );
                return (
                  <tr key={r.id}>
                    <td data-label="Report">
                      <strong>{o?.title || "Saved opportunity"}</strong>
                      <small className="muted">
                        {o?.buyer} · {o && provenance(o)}
                      </small>
                    </td>
                    <td data-label="Type">{kindLabel[r.kind]}</td>
                    <td data-label="Saved">
                      {date(r.created_at)}
                      <small className="muted">
                        {new Date(r.created_at).toLocaleTimeString("en-NZ", {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </small>
                    </td>
                    <td data-label="Review">
                      <Badge>
                        {r.review_state === "approved"
                          ? "Internally reviewed"
                          : r.review_state === "changes-requested"
                            ? "Corrections requested"
                            : "Awaiting review"}
                      </Badge>
                    </td>
                    <td className="table-action">
                      <Button
                        kind="text"
                        onClick={() => go("report", r.opportunity_id, r.id)}
                      >
                        Read report <I.ArrowRight size={16} />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
export function MarketView({
  boot,
  reports,
  go,
  onProfile,
  busy,
}: {
  boot: Bootstrap;
  reports: ReportSummary[];
  go: Navigate;
  onProfile: (r: ReportSummary) => void;
  busy: boolean;
}) {
  const latest = boot.opportunities.map((o) => ({
    o,
    r: reports.find((r) => r.opportunity_id === o.id && r.kind === "pursuit"),
  }));
  return (
    <>
      <Heading
        go={go}
        eyebrow="MARKET INTELLIGENCE"
        title="Understand the wider field."
        description="Buyer and supplier context from the evidence behind your pursuits."
      />
      <nav className="subnav" aria-label="Market navigation">
        <button
          className="active"
          aria-current="page"
          onClick={() => go("market")}
        >
          Buyer & competitor intelligence
        </button>
        <button onClick={() => go("brief")}>Weekly watch brief</button>
      </nav>
      <p className="muted">
        A saved assessment is a stored pursuit report for one opportunity. This
        view uses its latest saved version; analyst review may still be pending.
        Supplier names are source observations, not independently verified legal
        identities or confirmed bidders.
      </p>
      {!latest.some((x) => x.r) && (
        <Empty
          title="Build your market picture"
          description="Your assessed opportunities will bring buyer and supplier context together here."
          action={
            <Button onClick={() => go("watchlist")}>Open watchlist</Button>
          }
        />
      )}
      {latest
        .filter((x) => x.r)
        .map(({ o, r }) => (
          <section className="connected-panel section-gap" key={o.id}>
            <div className="section-heading">
              <div>
                <span className="eyebrow">{o.buyer}</span>
                <h2>{o.title}</h2>
              </div>
              <Badge>{provenance(o)}</Badge>
            </div>
            <p className="small muted">
              Assessment cutoff {date(r!.cutoff)} · Scope limited to admitted
              sources
            </p>
            {r!.entities.length ? (
              r!.entities.map((e, i) => (
                <article className="candidate-row" key={e.name + i}>
                  <div className="candidate-identity">
                    <h3>{e.name}</h3>
                    <Badge>Identity needs verification</Badge>
                  </div>
                  <p>
                    Named in the saved intelligence for this opportunity.
                    Inspect its evidence, relationship and limitations before
                    drawing a competitive conclusion.
                  </p>
                </article>
              ))
            ) : (
              <p>No supplier identities established in this assessment.</p>
            )}
            <p className="small muted">
              The notice-linked supplier profile covers this opportunity's saved
              observations and evidence gaps.
            </p>
            <div className="market-actions">
              <Button kind="text" disabled={busy} onClick={() => onProfile(r!)}>
                Open or prepare supplier profile <I.ArrowRight size={16} />
              </Button>
              <Button kind="text" onClick={() => go("pursuit", o.id)}>
                Open pursuit and award context
              </Button>
            </div>
          </section>
        ))}
      {!latest.some((x) => x.r) && (
        <Empty
          title="Build your first view of the market"
          description="A saved pursuit brings its sourced buyer and supplier context here."
          action={
            <Button onClick={() => go("watchlist")}>Open watchlist</Button>
          }
        />
      )}
    </>
  );
}
