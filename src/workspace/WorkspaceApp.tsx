import { useEffect, useState, useSyncExternalStore } from "react";
import { Badge, Button, Empty, I, Loading, Notice } from "../ui";
import { LocalOperations } from "../LocalOperations";
import { LocalCollections } from "../LocalCollections";
import { HomeView, WatchlistView, LibraryView, MarketView } from "./Overview";
import { PursuitView } from "./Assessment";
import {
  AddOpportunity,
  FirmView,
  SourceView,
  SourceDialog,
  UploadView,
  RequestView,
  ProgressView,
  RequirementsView,
  type Action,
} from "./Workflows";
import { DecisionsView, ReviewQueue } from "./Decisions";
import { BriefView } from "./Brief";
import { GetsMappingReview } from "./GetsMappingReview";
import { SectorSettings } from "./SectorSettings";
import { Heading, WorkspaceHeader, WorkspaceFooter } from "./Chrome";
import {
  request,
  RequestError,
  activeRun,
  type Bootstrap,
  type Detail,
  type EvidenceSource,
  type Navigate,
  type Page,
  type ReportSummary,
  type SavedReport,
} from "./data";
import "./workspace.css";
const pages: Page[] = [
  "home",
  "watchlist",
  "pursuit",
  "sources",
  "upload",
  "request",
  "processing",
  "requirements",
  "decisions",
  "reports",
  "report",
  "market",
  "brief",
  "firm",
  "ops",
  "delivery",
  "mapping",
  "sectors",
];
const subscribe = (fn: () => void) => {
  window.addEventListener("hashchange", fn);
  return () => window.removeEventListener("hashchange", fn);
};
const contextPages: Page[] = [
  "pursuit",
  "sources",
  "upload",
  "request",
  "processing",
  "requirements",
  "decisions",
  "report",
];
export function WorkspaceApp() {
  const route = useSyncExternalStore(
      subscribe,
      () => location.hash,
      () => "",
    ),
    [path, query = ""] = route.replace(/^#\/?/, "").split("?"),
    params = new URLSearchParams(query),
    page = pages.includes(path as Page) ? (path as Page) : "home";
  const [boot, setBoot] = useState<Bootstrap | null>(null),
    [reports, setReports] = useState<ReportSummary[]>([]),
    [auth, setAuth] = useState<"loading" | "signed-in" | "signed-out">(
      "loading",
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [toast, setToast] = useState(""),
    [adding, setAdding] = useState(false);
  const [detail, setDetail] = useState<Detail | null>(null),
    [report, setReport] = useState<SavedReport | null>(null),
    [source, setSource] = useState<EvidenceSource | null>(null),
    [evidenceOpen, setEvidenceOpen] = useState(false),
    [unitId, setUnitId] = useState<string | undefined>(),
    [evidenceQuote, setEvidenceQuote] = useState<string | undefined>();
  const explicitReport = params.get("report") || "",
    opportunityId =
      params.get("opportunity") ||
      reports.find((r) => r.id === explicitReport)?.opportunity_id ||
      (contextPages.includes(page) ||
      page === "delivery" ||
      (page === "ops" && explicitReport)
        ? boot?.opportunities[0]?.id || ""
        : "");
  const currentDetail =
    detail?.opportunity.id === opportunityId ? detail : null;
  const reportId =
    explicitReport ||
    currentDetail?.reports.find((r) => r.kind === "pursuit")?.id ||
    "";
  const currentReport = report?.id === reportId ? report : null;
  const go: Navigate = (next, opportunity, selectedReport) => {
    const q = new URLSearchParams();
    if (opportunity) q.set("opportunity", opportunity);
    if (selectedReport) q.set("report", selectedReport);
    location.hash = "/" + next + (q.size ? "?" + q : "");
    setError("");
    setEvidenceOpen(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  function onError(e: Error) {
    setError(e.message);
    if (e instanceof RequestError && e.status === 401) {
      setAuth("signed-out");
      setBoot(null);
      setReports([]);
      setDetail(null);
      setReport(null);
      setSource(null);
      setEvidenceOpen(false);
    }
  }
  async function refresh() {
    const [b, r] = await Promise.all([
      request<Bootstrap>("/bootstrap"),
      request<{ reports: ReportSummary[] }>("/report-library"),
    ]);
    setBoot(b);
    setReports(r.reports);
    setAuth("signed-in");
  }
  async function reloadDetail() {
    if (opportunityId)
      setDetail(await request<Detail>("/opportunities/" + opportunityId));
    if (reportId) setReport(await request<SavedReport>("/reports/" + reportId));
    await refresh();
  }
  const action: Action = async (fn, message) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      if (message) setToast(message);
    } catch (e) {
      onError(e as Error);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    let live = true;
    Promise.all([
      request<Bootstrap>("/bootstrap"),
      request<{ reports: ReportSummary[] }>("/report-library"),
    ])
      .then(([b, r]) => {
        if (live) {
          setBoot(b);
          setReports(r.reports);
          setAuth("signed-in");
        }
      })
      .catch((e) => {
        if (live) {
          setAuth("signed-out");
          if (e.status !== 401) setError(e.message);
        }
      });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (auth !== "signed-in" || !opportunityId) return;
    let live = true;
    const load = async () => {
      try {
        const d = await request<Detail>("/opportunities/" + opportunityId);
        if (live) setDetail(d);
      } catch (e) {
        if (live) onError(e as Error);
      }
    };
    void load();
    return () => {
      live = false;
    };
  }, [opportunityId, auth]);
  const running = currentDetail && activeRun(currentDetail);
  useEffect(() => {
    if (!running || !opportunityId) return;
    let live = true;
    const timer = setInterval(() => {
      void request<Detail>("/opportunities/" + opportunityId)
        .then(async (d) => {
          if (!live) return;
          setDetail(d);
          if (!activeRun(d)) await refresh();
        })
        .catch((e) => {
          if (live) onError(e);
        });
    }, 2000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [running?.id, opportunityId]);
  useEffect(() => {
    if (auth !== "signed-in" || !reportId) return;
    let live = true;
    void request<SavedReport>("/reports/" + reportId)
      .then((r) => {
        if (live) setReport(r);
      })
      .catch((e) => {
        if (live) onError(e);
      });
    return () => {
      live = false;
    };
  }, [reportId, auth, page]);
  useEffect(() => {
    document.title =
      "Groundwork · " +
      {
        home: "Home",
        watchlist: "Watchlist",
        pursuit: "Pursuit Room",
        sources: "Evidence library",
        upload: "Add documents",
        request: "Request analysis",
        processing: "Analysis progress",
        requirements: "Requirements",
        decisions: "Your decision",
        reports: "Report library",
        report: "Saved report",
        market: "Market intelligence",
        brief: "Weekly brief",
        firm: "Firm profiles",
        ops: "Reviewer tools",
        delivery: "Refresh & delivery",
        mapping: "GETS mapping review",
        sectors: "Groundwork sectors",
      }[page];
    document.getElementById("main-content")?.focus({ preventScroll: true });
  }, [route, page]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(t);
  }, [toast]);
  async function openSource(id: string, unit?: string) {
    setUnitId(unit);
    setEvidenceQuote(undefined);
    setSource(null);
    setEvidenceOpen(true);
    await action(async () => {
      try {
        setSource(await request<EvidenceSource>("/sources/" + id));
      } catch (e) {
        setEvidenceOpen(false);
        throw e;
      }
    });
  }
  async function openEvidence(id: string, quote?: string) {
    setEvidenceQuote(quote);
    await action(async () => {
      const u = await request<{ sourceId: string }>("/units/" + id);
      setUnitId(id);
      setSource(null);
      setEvidenceOpen(true);
      try {
        setSource(await request<EvidenceSource>("/sources/" + u.sourceId));
      } catch (e) {
        setEvidenceOpen(false);
        throw e;
      }
    });
  }
  async function derive(
    kind: "watchlist" | "competitor" | "weekly",
    r: ReportSummary | SavedReport | null = currentReport,
  ) {
    if (!r) return;
    await action(async () => {
      const base =
        r.kind === "pursuit"
          ? r.id
          : ("payload" in r
              ? r
              : await request<SavedReport>("/reports/" + r.id)
            ).payload.sourcePursuitId;
      if (!base) throw new Error("Open the underlying pursuit first.");
      const saved = await request<Detail>("/opportunities/" + r.opportunity_id);
      const existing = saved.reports.find(
        (item) => item.kind === kind && item.payload.sourcePursuitId === base,
      );
      if (existing) {
        setDetail(saved);
        go("report", r.opportunity_id, existing.id);
        return;
      }
      const result = await request<{ id: string }>(
        "/reports/" + base + "/derive",
        { kind },
      );
      await refresh();
      if (opportunityId)
        setDetail(await request("/opportunities/" + opportunityId));
      go("report", r.opportunity_id, result.id);
    });
  }
  if (auth === "loading")
    return (
      <main className="app-main">
        <Loading />
      </main>
    );
  if (auth === "signed-out")
    return (
      <div className="connected-app">
        <header className="topbar">
          <span className="wordmark">Groundwork</span>
        </header>
        <main className="connected-login">
          <section>
            <span className="eyebrow">GROUNDWORK BY BIDEDGE</span>
            <h1>Know before you bid.</h1>
            <p className="lead">
              Open your workspace to explore opportunities, inspect the evidence
              and make a considered decision.
            </p>
            <form
              className="connected-form"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void action(async () => {
                  await request("/session", { key: f.get("key") });
                  await refresh();
                }, "Welcome to your workspace.");
              }}
            >
              <label>
                Workspace access key
                <input type="password" name="key" required autoComplete="off" />
              </label>
              <Button type="submit" disabled={busy}>
                Open workspace <I.ArrowRight size={17} />
              </Button>
            </form>
            {error && (
              <Notice title="We couldn’t open your workspace" tone="error">
                {error}
              </Notice>
            )}
            <p className="small muted section-gap">
              Private evaluation · Enter your workspace access key to open saved
              reports and evidence.
            </p>
          </section>
          <aside className="pursuit-rail">
            <h2>A clearer view of the opportunity.</h2>
            <p>
              Understand the field. Test the assumptions. Keep the evidence
              behind every decision.
            </p>
            <a href="/prototype/#/home">View the original design reference</a>
          </aside>
        </main>
      </div>
    );
  if (!boot) return null;
  const needsDetail =
    contextPages.includes(page) || (page === "ops" && !!explicitReport);
  const needsReport =
    ["pursuit", "report", "requirements", "decisions"].includes(page) ||
    (page === "ops" && !!explicitReport);
  const waiting =
    (needsDetail && !currentDetail) ||
    (needsReport && !!reportId && !currentReport);
  const client = boot.clients.find(
    (c) => c.id === currentDetail?.opportunity.client_id,
  );
  let content;
  if (needsDetail && !opportunityId)
    content = (
      <Empty
        title="Choose an opportunity first"
        description="Add a notice to start your pursuit, or open one from the watchlist."
        action={<Button onClick={() => go("watchlist")}>Open watchlist</Button>}
      />
    );
  else if (waiting)
    content = error ? (
      <Empty
        title="This saved item could not be opened"
        description="Retry the request above, or choose another opportunity from your watchlist."
        action={<Button onClick={() => go("watchlist")}>Open watchlist</Button>}
      />
    ) : (
      <Loading label="Opening your saved workspace" />
    );
  else if (
    currentReport &&
    currentDetail &&
    currentReport.opportunity_id !== currentDetail.opportunity.id
  )
    content = (
      <Empty
        title="This report belongs to another opportunity"
        description="Open it from the report library to see the correct evidence and context."
        action={
          <Button onClick={() => go("reports")}>Open report library</Button>
        }
      />
    );
  else if (
    boot.role === "reviewer" &&
    ["upload", "request", "delivery", "firm"].includes(page)
  )
    content = (
      <Empty
        title="Owner access required"
        description="Your access is for reviewing reports and evidence. Ask Shaun to add sources, update settings or generate a report."
        action={<Button onClick={() => go("reports")}>Open reports</Button>}
      />
    );
  else
    switch (page) {
      case "home":
        content = <HomeView boot={boot} reports={reports} go={go} />;
        break;
      case "watchlist":
        content = (
          <WatchlistView
            boot={boot}
            reports={reports}
            go={go}
            onAdd={() => setAdding(true)}
            onImported={refresh}
            onEvidence={(id, quote) => void openEvidence(id, quote)}
          />
        );
        break;
      case "market":
        content = (
          <MarketView
            boot={boot}
            reports={reports}
            go={go}
            busy={busy}
            onProfile={(r) => void derive("competitor", r)}
          />
        );
        break;
      case "reports":
        content = <LibraryView boot={boot} reports={reports} go={go} />;
        break;
      case "brief":
        content = (
          <BriefView
            boot={boot}
            go={go}
            action={action}
            busy={busy}
            onError={onError}
          />
        );
        break;
      case "firm":
        content = (
          <FirmView
            boot={boot}
            go={go}
            busy={busy}
            onSave={(v) =>
              void action(async () => {
                await request("/clients", v);
                await refresh();
              }, "Firm profile saved.")
            }
          />
        );
        break;
      case "sources":
        content = (
          <SourceView
            owner={boot!.role === "owner"}
            researchEnabled={!!boot!.researchEnabled}
            onRefresh={reloadDetail}
            key={opportunityId}
            detail={currentDetail!}
            go={go}
            onSource={(id) => void openSource(id)}
            onEvidence={(id, quote) => void openEvidence(id, quote)}
            action={action}
            busy={busy}
          />
        );
        break;
      case "upload":
        content = (
          <UploadView
            key={opportunityId}
            detail={currentDetail!}
            go={go}
            action={action}
            busy={busy}
            onSaved={reloadDetail}
          />
        );
        break;
      case "request":
        content = (
          <RequestView
            key={opportunityId}
            detail={currentDetail!}
            go={go}
            action={action}
            busy={busy}
            onRefresh={reloadDetail}
          />
        );
        break;
      case "processing":
        content = (
          <ProgressView
            detail={currentDetail!}
            go={go}
            action={action}
            busy={busy}
            onRefresh={reloadDetail}
          />
        );
        break;
      case "requirements":
        content = (
          <RequirementsView
            detail={currentDetail!}
            report={currentReport}
            go={go}
            onEvidence={(id, quote) => void openEvidence(id, quote)}
          />
        );
        break;
      case "decisions":
        content = (
          <DecisionsView
            report={currentReport}
            detail={currentDetail!}
            go={go}
            action={action}
            busy={busy}
            onRefresh={reloadDetail}
            onEvidence={(id, quote) => void openEvidence(id, quote)}
          />
        );
        break;
      case "ops":
        content = explicitReport ? (
          <DecisionsView
            reviewer
            report={currentReport}
            detail={currentDetail!}
            go={go}
            action={action}
            busy={busy}
            onRefresh={reloadDetail}
            onEvidence={(id, quote) => void openEvidence(id, quote)}
          />
        ) : (
          <ReviewQueue boot={boot} go={go} />
        );
        break;
      case "delivery":
        content = (
          <>
            <Heading
              go={go}
              eyebrow="BIDEDGE OPERATIONS"
              title="Keep the next update moving."
              description="Scheduled refresh, saved collections and internal delivery."
            />
            <label className="connected-select">
              Opportunity for scheduled refresh
              <select
                value={opportunityId}
                onChange={(e) => go("delivery", e.target.value)}
              >
                {boot.opportunities.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.title}
                  </option>
                ))}
              </select>
            </label>
            <div className="connected-operations">
              <LocalOperations
                key={opportunityId}
                request={request}
                selected={opportunityId}
                onReport={(id) => go("report", undefined, id)}
                onError={(s) => setError(s)}
              />
              <details className="collection-review">
                <summary>Collection review and internal delivery</summary>
                <LocalCollections
                  request={request}
                  clients={boot.clients}
                  onReport={(id) => go("report", undefined, id)}
                  onError={(s) => setError(s)}
                />
              </details>
            </div>
          </>
        );
        break;
      case "mapping":
        content = <GetsMappingReview go={go} owner={boot.role === "owner"} />;
        break;
      case "sectors":
        content = (
          <SectorSettings
            go={go}
            owner={boot.role === "owner"}
            onSaved={refresh}
          />
        );
        break;
      default:
        content = (
          <PursuitView
            detail={currentDetail!}
            report={currentReport}
            client={client}
            clients={boot!.clients}
            owner={boot!.role === "owner"}
            onRefresh={reloadDetail}
            go={go}
            onEvidence={(id, quote) => void openEvidence(id, quote)}
            busy={busy}
            onDerive={(k) => void derive(k)}
            fixed={page === "report"}
          />
        );
    }
  return (
    <div className="connected-app">
      <WorkspaceHeader
        page={page}
        go={go}
        opportunityId={contextPages.includes(page) ? opportunityId : undefined}
        onSignOut={() =>
          void action(async () => {
            await request("/sign-out", {});
            setBoot(null);
            setReports([]);
            setDetail(null);
            setReport(null);
            setSource(null);
            setAuth("signed-out");
            setEvidenceOpen(false);
            go("home");
          })
        }
      />
      <main
        id="main-content"
        className="app-main connected-main"
        tabIndex={-1}
        data-screen={page}
      >
        {boot.role === "reviewer" && (
          <Notice title="Review access" tone="info">
            You can read reports, inspect evidence and record feedback. Shaun
            manages new assessments and sources.
          </Notice>
        )}
        {error && (
          <Notice
            title="We couldn’t complete that action"
            tone="error"
            action={
              <Button kind="text" onClick={() => void action(reloadDetail)}>
                Try again
              </Button>
            }
          >
            {error}
          </Notice>
        )}
        {running && page !== "processing" && (
          <Notice title="Your assessment is in progress" tone="info">
            Your previous report remains available.{" "}
            <Button kind="text" onClick={() => go("processing", opportunityId)}>
              View progress
            </Button>
          </Notice>
        )}
        {content}
        <WorkspaceFooter go={go} />
      </main>
      {toast && (
        <div className="toast" role="status">
          <I.CheckCircle size={18} />
          {toast}
        </div>
      )}
      {adding && (
        <AddOpportunity
          boot={boot}
          busy={busy}
          onClose={() => setAdding(false)}
          onSave={(v) =>
            void action(async () => {
              const result = await request<{ id: string }>("/opportunities", v);
              await refresh();
              setAdding(false);
              go("upload", result.id);
            }, "Opportunity saved.")
          }
        />
      )}
      {evidenceOpen && (
        <SourceDialog
          key={source?.id || "loading"}
          source={source}
          unitId={unitId}
          quote={evidenceQuote}
          onClose={() => setEvidenceOpen(false)}
        />
      )}
    </div>
  );
}
