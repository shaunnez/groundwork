import { useState } from "react";
import { useDemo } from "./context";
import { ProgressSteps } from "./Reports";
import {
  Badge,
  Button,
  Empty,
  I,
  KeyFacts,
  Modal,
  Notice,
  PageHeader,
  Search,
  StateBoundary,
  Tabs,
} from "./ui";
const tabs = [
  { label: "Work queue", id: "ops" },
  { label: "Source health", id: "source-health" },
  { label: "Schedules", id: "schedules" },
  { label: "Usage", id: "usage" },
  { label: "Delivery", id: "delivery" },
];
const runs = [
  ["GETS daily intake", "Public", "Failed", "08:15", "2 pages unreadable"],
  [
    "Pursuit assessment",
    "Koru Advisory",
    "Running",
    "10:18",
    "Assessing requirements",
  ],
  [
    "MBIE historical refresh",
    "Public",
    "Succeeded",
    "06:30",
    "Award grain validated",
  ],
  [
    "Agency intelligence",
    "Public",
    "Queued",
    "10:30",
    "Waiting for intake publication",
  ],
  [
    "Weekly briefs",
    "Tenant scoped",
    "Succeeded",
    "7 Sep",
    "Published; delivery separate",
  ],
  [
    "Procurement plan refresh",
    "Public",
    "Succeeded",
    "8 Sep",
    "24 pages validated",
  ],
  [
    "Policy library refresh",
    "Public",
    "Succeeded",
    "8 Sep",
    "Previous accepted source retained",
  ],
];
const sourceRows = [
  ["GETS open notices", "Daily", "9 Sep, 08:15", "Partial", "16 / 18 notices"],
  [
    "MBIE awards",
    "Monthly",
    "1 Sep, 06:30",
    "Current",
    "Coherent dataset published",
  ],
  [
    "Agency procurement plans",
    "Monthly",
    "8 Sep, 11:30",
    "Current",
    "24 / 24 pages",
  ],
  [
    "Policy library",
    "Daily / weekly",
    "8 Sep, 09:00",
    "Needs refresh",
    "1 source unavailable",
  ],
];
export function OperatorQueue() {
  const { scene, go } = useDemo();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All states");
  const rows = runs
    .map((r, index) => ({ r, index }))
    .filter(
      ({ r }) =>
        r.join(" ").toLowerCase().includes(search.toLowerCase()) &&
        (status === "All states" || r[2] === status),
    );
  return (
    <>
      <PageHeader
        eyebrow="SERVICE OPERATIONS"
        title="Keep the work trustworthy."
        description="Inspect source freshness, durable work and the last accepted publication."
        breadcrumb="Operations"
      />
      <Tabs items={tabs} />
      <KeyFacts
        items={[
          ["Needs attention", "1 required stage failed"],
          ["In progress", "1 running · 1 queued"],
          ["Last accepted intake", "8 Sep 2026 · 08:15"],
        ]}
      />
      <div className="filter-row">
        <Search
          value={search}
          onChange={setSearch}
          placeholder="Search workflow or owner"
        />
        <select
          aria-label="Run state"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          {["All states", "Failed", "Running", "Queued", "Succeeded"].map(
            (s) => (
              <option key={s}>{s}</option>
            ),
          )}
        </select>
      </div>
      <StateBoundary
        emptyTitle="No work in this queue"
        emptyDescription="There are no matching pending or recent runs. Source schedules are still available."
        emptyAction={
          <Button onClick={() => go("schedules")}>Inspect schedules</Button>
        }
      >
        {scene === "partial" && (
          <Notice title="The latest intake was not published">
            Required parsing failed. The customer portal retains the last
            accepted snapshot.
          </Notice>
        )}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Workflow</th>
                <th>Owner</th>
                <th>State</th>
                <th>Accepted</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ r, index: i }) => (
                <tr key={r[0]}>
                  <td>
                    <button
                      className="table-title"
                      onClick={() =>
                        go(
                          "run",
                          r[2] === "Failed"
                            ? "failed"
                            : r[2] === "Succeeded"
                              ? "complete"
                              : r[2] === "Queued"
                                ? "queued"
                                : "processing",
                          { job: String(i) },
                        )
                      }
                    >
                      {r[0]}
                    </button>
                  </td>
                  <td>{r[1]}</td>
                  <td>
                    <Badge
                      tone={
                        r[2] === "Failed"
                          ? "error"
                          : r[2] === "Succeeded"
                            ? "success"
                            : "warning"
                      }
                    >
                      {r[2]}
                    </Badge>
                  </td>
                  <td>{r[3]}</td>
                  <td>{r[4]}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && (
            <Empty
              title="No matching runs"
              description="Try a different workflow, owner or state."
            />
          )}
        </div>
      </StateBoundary>
    </>
  );
}
export function Run() {
  const { scene, params, go } = useDemo();
  const job = Math.max(
    0,
    Math.min(runs.length - 1, Number(params.get("job") || 0)),
  );
  const [confirm, setConfirm] = useState(false);
  const stage =
    scene === "normal"
      ? "failed"
      : scene === "complete"
        ? "ready"
        : scene === "processing"
          ? "assessing"
          : scene;
  const labels =
    job === 0
      ? [
          "Request accepted",
          "Extracting notices",
          "Classifying opportunities",
          "Validating snapshot",
          "Intake published",
        ]
      : job === 2
        ? [
            "Request accepted",
            "Staging award files",
            "Reconciling contract grain",
            "Validating dataset",
            "Awards published",
          ]
        : job === 3
          ? [
              "Request accepted",
              "Reading accepted intake",
              "Researching agency context",
              "Validating sources",
              "Intelligence published",
            ]
          : job === 4
            ? [
                "Request accepted",
                "Reading relevant signals",
                "Preparing firm brief",
                "Validating coverage",
                "Brief published",
              ]
            : undefined;
  const history =
    stage === "ready"
      ? [
          "Input version captured",
          "Required stages succeeded",
          "Output validation passed",
          "Publication accepted",
        ]
      : stage === "queued"
        ? [
            "Request accepted",
            "Input version captured",
            "Queued; waiting for required dependencies",
          ]
        : stage === "cancelled"
          ? [
              "Input version captured",
              "Cancellation recorded",
              "No replacement output published",
            ]
          : stage === "failed"
            ? [
                "Input version captured",
                "Extraction attempt 1 started",
                "Required source extraction failed",
                "Dependent stages blocked",
                "Previous publication retained",
              ]
            : stage === "retrying"
              ? [
                  "Earlier failed attempt retained",
                  "Retry accepted with the same input manifest",
                  "Failed stage resumed",
                  "Previously accepted outputs reused",
                ]
              : [
                  "Input version captured",
                  "Required dependencies satisfied",
                  "Stage in progress; heartbeat received",
                ];
  return (
    <>
      <PageHeader
        eyebrow="RUN DETAIL · R-2026-0909-01"
        title={runs[job][0]}
        description="Stage outcomes and publication are tracked independently."
        breadcrumb="Operations"
        actions={
          <Badge
            tone={
              stage === "failed"
                ? "error"
                : stage === "ready"
                  ? "success"
                  : "warning"
            }
          >
            {stage === "ready" ? "Succeeded" : stage}
          </Badge>
        }
      />
      <Tabs items={tabs} />
      <StateBoundary>
        <KeyFacts
          items={[
            ["Owner", runs[job][1]],
            ["Input manifest", "Source snapshot 2026-09-09.2"],
            ["Last heartbeat", "9 Sep, 10:19 NZST"],
            [
              "Publication",
              stage === "ready" ? "Accepted" : "No new accepted output",
            ],
          ]}
        />
        {stage === "failed" && (
          <Notice
            title="Required stage failed · publication blocked"
            tone="error"
          >
            Extraction could not read two required pages. Dependent stages
            cannot publish a complete result.
          </Notice>
        )}
        <div className="two-col">
          <ProgressSteps
            stage={stage}
            operator
            labels={
              job >= 5
                ? [
                    "Request accepted",
                    "Capturing public sources",
                    "Extracting source passages",
                    "Validating coverage",
                    "Source snapshot published",
                  ]
                : labels
            }
          />
          <aside>
            <h2>Recovery</h2>
            <p>
              Retry this run’s failed stage. Reuse valid accepted outputs; do
              not regenerate unrelated reports.
            </p>
            <div className="inline">
              <Button
                onClick={() => go("run", "retrying", { job: String(job) })}
                disabled={stage !== "failed"}
              >
                <I.Refresh size={16} />
                Retry failed stage
              </Button>
              <Button
                kind="secondary"
                onClick={() => setConfirm(true)}
                disabled={stage === "ready" || stage === "cancelled"}
              >
                Cancel run
              </Button>
            </div>
            <h2 className="section-gap">Attempt history</h2>
            <div className="log-lines">
              {history.map((entry, i) => (
                <p key={entry}>
                  <time>10:18:{String(2 + i * 2).padStart(2, "0")}</time>
                  {entry}
                </p>
              ))}
            </div>
            <Button
              kind="text"
              onClick={() =>
                go("source-detail", "normal", { id: job === 2 ? "1" : "0" })
              }
            >
              Inspect input source <I.ArrowRight size={16} />
            </Button>
            <Notice title="Operational metadata only" tone="info">
              This view does not grant access to a customer’s private source
              documents.
            </Notice>
          </aside>
        </div>
      </StateBoundary>
      {confirm && (
        <Modal title="Cancel this run?" onClose={() => setConfirm(false)}>
          <p>
            {runs[job][0]} will stop publishing further output. Existing
            accepted records remain.
          </p>
          <div className="form-actions">
            <Button kind="secondary" onClick={() => setConfirm(false)}>
              Keep running
            </Button>
            <Button
              kind="danger"
              onClick={() => {
                setConfirm(false);
                go("run", "cancelled", { job: String(job) });
              }}
            >
              Cancel this run
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
export function SourceHealth({ detail = false }: { detail?: boolean }) {
  const { scene, params, go } = useDemo();
  const index = Math.max(0, Math.min(3, Number(params.get("id") || 0)));
  const [refreshing, setRefreshing] = useState(false);
  const incomplete = scene === "partial" || index === 0 || index === 3;
  const sourceJob = [0, 2, 5, 6][index];
  const issue =
    index === 3
      ? "One upstream policy source is unavailable. The earlier accepted version is retained."
      : "Required source material could not be extracted. No accepted replacement.";
  return (
    <>
      <PageHeader
        title={detail ? sourceRows[index][0] : "Know how current “current” is."}
        description={
          detail
            ? "Captured versions, extraction outcomes and publication history."
            : "Freshness and coverage of public procurement sources."
        }
        breadcrumb="Operations"
      />
      <Tabs items={tabs} />
      <StateBoundary
        emptyTitle="No registered sources"
        emptyDescription="Register and validate a source before scheduling ingestion."
      >
        {scene === "partial" && (
          <Notice title="Partial extraction has not replaced the accepted version">
            The last successful snapshot remains current until its replacement
            validates.
          </Notice>
        )}
        {detail ? (
          <>
            <KeyFacts
              items={[
                ["Source group", sourceRows[index][0]],
                ["Latest capture", sourceRows[index][2] + " · version 2"],
                [
                  "Accepted publication",
                  incomplete
                    ? "Earlier accepted snapshot · version 1"
                    : "Latest coherent snapshot · version 2",
                ],
                ["Coverage", sourceRows[index][4]],
              ]}
            />
            <div className="two-col">
              <section>
                <h2>Version history</h2>
                <div className="history-list">
                  <article>
                    <Badge tone={incomplete ? "warning" : "success"}>
                      v2 ·{" "}
                      {incomplete
                        ? "captured, incomplete"
                        : "accepted publication"}
                    </Badge>
                    <h3>{sourceRows[index][2]}</h3>
                    <p>
                      {incomplete
                        ? issue
                        : "Extraction and validation succeeded. Downstream consumers can use this accepted snapshot."}
                    </p>
                    <Button
                      kind="text"
                      onClick={() =>
                        go("run", incomplete ? "failed" : "complete", {
                          job: String(sourceJob),
                        })
                      }
                    >
                      Inspect extraction run
                    </Button>
                  </article>
                  <article>
                    <Badge tone="success">v1 · accepted publication</Badge>
                    <h3>8 September 2026</h3>
                    <p>
                      Coherent source snapshot retained. Downstream consumers
                      remain on this version.
                    </p>
                  </article>
                </div>
              </section>
              <aside className="form-surface">
                <h2>Source recovery</h2>
                <p>
                  Refresh only this registered public source. Downstream
                  analysis waits for accepted extraction.
                </p>
                <Button
                  disabled={refreshing || scene === "processing"}
                  onClick={() => {
                    setRefreshing(true);
                    setTimeout(() => {
                      setRefreshing(false);
                      go("run", "queued", { job: String(sourceJob) });
                    }, 500);
                  }}
                >
                  {refreshing || scene === "processing"
                    ? "Enqueuing capture…"
                    : "Enqueue source refresh"}
                </Button>
                {incomplete ? (
                  <Notice title="Coverage gap">{issue}</Notice>
                ) : (
                  <Notice title="Source coverage accepted" tone="success">
                    The current source snapshot passed its required checks.
                  </Notice>
                )}
              </aside>
            </div>
          </>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Refresh</th>
                  <th>Last check</th>
                  <th>Status</th>
                  <th>Coverage</th>
                </tr>
              </thead>
              <tbody>
                {sourceRows.map((r, i) => (
                  <tr key={r[0]}>
                    <td>
                      <button
                        className="table-title"
                        onClick={() =>
                          go("source-detail", "normal", { id: String(i) })
                        }
                      >
                        {r[0]}
                      </button>
                    </td>
                    <td>{r[1]}</td>
                    <td>{r[2]}</td>
                    <td>
                      <Badge tone={r[3] === "Current" ? "success" : "warning"}>
                        {r[3]}
                      </Badge>
                    </td>
                    <td>{r[4]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </StateBoundary>
    </>
  );
}
export function Schedules() {
  const { scene, notify } = useDemo();
  const [paused, setPaused] = useState<string[]>(
    scene === "paused" ? ["GETS daily intake"] : [],
  );
  const rows = [
    [
      "GETS daily intake",
      "Daily · 06:00",
      "Capture → extract → classify → publish",
    ],
    [
      "Agency intelligence",
      "After accepted intake",
      "Requires a successful intake publication",
    ],
    [
      "MBIE historical refresh",
      "Monthly · 1st, 06:30",
      "Stage files → reconcile grain → validate",
    ],
    [
      "Policy library",
      "Daily / weekly by source",
      "Extract before publishing new signals",
    ],
    [
      "Procurement plans",
      "Monthly · 2nd, 07:00",
      "Publish only a coherent current snapshot",
    ],
    [
      "Weekly briefs",
      "Monday · 07:30",
      "Requires accepted relevant source data",
    ],
    [
      "Customer report requests",
      "On demand",
      "Inputs → required stages → report → delivery",
    ],
  ];
  return (
    <>
      <PageHeader
        title="Every workflow has a home."
        description="Schedules use Pacific/Auckland civil time and explicit dependencies."
        breadcrumb="Operations"
      />
      <Tabs items={tabs} />
      <StateBoundary>
        <Notice title="Timing alone does not satisfy a dependency" tone="info">
          A later scheduled time cannot bypass a failed required stage.
        </Notice>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Workflow</th>
                <th>When</th>
                <th>Required order</th>
                <th>State</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r[0]}>
                  <td>
                    <strong>{r[0]}</strong>
                  </td>
                  <td>{r[1]}</td>
                  <td>{r[2]}</td>
                  <td>
                    <Badge tone={paused.includes(r[0]) ? "warning" : "success"}>
                      {paused.includes(r[0]) ? "Paused" : "Active"}
                    </Badge>
                  </td>
                  <td>
                    <Button
                      kind="text"
                      onClick={() => {
                        setPaused((v) =>
                          v.includes(r[0])
                            ? v.filter((x) => x !== r[0])
                            : [...v, r[0]],
                        );
                        notify(
                          "Demo schedule updated. No real scheduler was changed.",
                        );
                      }}
                    >
                      {paused.includes(r[0]) ? (
                        <>
                          <I.Play size={16} />
                          Resume
                        </>
                      ) : (
                        <>
                          <I.Pause size={16} />
                          Pause
                        </>
                      )}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </StateBoundary>
    </>
  );
}
export function Usage() {
  const { scene } = useDemo();
  const [period, setPeriod] = useState("Today");
  const rows = [
    ["Pursuit assessment", "Koru Advisory", "8", "24,000", "4,800", "0.84"],
    ["Agency intelligence", "Public", "6", "18,000", "2,400", "0.24"],
    ["Policy extraction", "Public", "5", "12,000", "1,500", "0.18"],
    ["Weekly briefs", "Tenant scoped", "5", "8,000", "1,200", "0.12"],
  ];
  return (
    <>
      <PageHeader
        title="Understand the work behind the answer."
        description="Fictional usage ledger · estimated USD costs, not billing totals."
        breadcrumb="Operations"
      />
      <Tabs items={tabs} />
      <div className="filter-row">
        <select
          aria-label="Usage period"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
        >
          <option>Today</option>
          <option>This week</option>
        </select>
        <span className="muted">
          {period === "Today" ? "9 September 2026" : "7–13 September 2026"} ·
          fixture has four recorded requests
        </span>
      </div>
      <StateBoundary
        emptyTitle="No recorded model usage"
        emptyDescription="No completed provider calls were recorded for this fixture period."
      >
        {scene === "partial" && (
          <Notice title="One provider usage record is incomplete">
            The estimate excludes the missing record. Do not treat it as a
            reconciled bill.
          </Notice>
        )}
        <KeyFacts
          items={[
            ["Recorded requests", "4"],
            ["Model calls", "24"],
            ["Estimated cost", "USD 1.38"],
            ["Provider", "Fixture provider · no actual calls"],
          ]}
        />
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Workflow</th>
                <th>Owner</th>
                <th>Calls</th>
                <th>Input tokens</th>
                <th>Output tokens</th>
                <th>Est. USD</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r[0]}>
                  {r.map((v, i) => (
                    <td key={i}>{v}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted small">
          Usage, retries and accepted outputs remain independently traceable.
          These are fictional example measurements.
        </p>
      </StateBoundary>
    </>
  );
}
export function Delivery() {
  const { demo, setDemo, scene, go, notify } = useDemo();
  const [sent, setSent] = useState(scene === "complete");
  const [busy, setBusy] = useState(scene === "processing");
  return (
    <>
      <PageHeader
        title="Published is not the same as delivered."
        description="Recover notifications independently of report generation."
        breadcrumb="Operations"
      />
      <Tabs items={tabs} />
      <StateBoundary
        emptyTitle="No pending deliveries"
        emptyDescription="Published reports remain available in the portal."
      >
        {(scene === "failed" || !sent) && (
          <Notice title="One report-ready notification failed" tone="error">
            The report was published successfully. Retry delivery without
            regenerating it.
          </Notice>
        )}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Notification</th>
                <th>Destination</th>
                <th>Report state</th>
                <th>Delivery</th>
                <th />
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <strong>Digital service transformation</strong>
                  <small>Report ready · dedupe key retained</small>
                </td>
                <td>alex@example.test</td>
                <td>
                  <Badge tone="success">
                    Published · v{demo.reportVersion}
                  </Badge>
                </td>
                <td>
                  <Badge tone={sent ? "success" : busy ? "warning" : "error"}>
                    {sent ? "Sent" : busy ? "Retrying" : "Failed"}
                  </Badge>
                </td>
                <td>
                  <Button
                    kind="secondary"
                    disabled={sent || busy}
                    onClick={() => {
                      setBusy(true);
                      setTimeout(() => {
                        setBusy(false);
                        setSent(true);
                        setDemo((d) => ({ ...d, emailFailed: false }));
                        notify("Demo delivery completed. No email was sent.");
                      }, 700);
                    }}
                  >
                    {busy
                      ? "Retrying…"
                      : sent
                        ? "Delivered"
                        : "Retry notification"}
                  </Button>
                </td>
              </tr>
              <tr>
                <td>Weekly brief</td>
                <td>alex@example.test</td>
                <td>
                  <Badge tone="success">Published</Badge>
                </td>
                <td>
                  <Badge tone="success">Sent</Badge>
                </td>
                <td>
                  <Button kind="text" onClick={() => go("brief")}>
                    View brief
                  </Button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <Notice title="Delivery does not own the report" tone="info">
          A delivery failure never deletes a report or creates a new assessment
          request.
        </Notice>
      </StateBoundary>
    </>
  );
}
