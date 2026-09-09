import { Component, useEffect, useState, type ReactNode } from "react";
import { DemoProvider, useDemo } from "./context";
import { screens, stateLabel } from "./catalogue";
import { advanceRequest, acceptRequest, initialDemo } from "./model";
import { Badge, Button, Empty, I, Search } from "./ui";
import { Pursuit, Requirements, Review, Decisions, Evidence } from "./Pursuit";
import {
  RequestAnalysis,
  Processing,
  ReportLibrary,
  ReportReader,
  Sharing,
} from "./Reports";
import {
  Watchlist,
  Market,
  Directory,
  EntityProfile,
  Awards,
  Signal,
  Renewals,
} from "./Market";
import { Sources, Upload, Firm, Preferences, Access } from "./AccountEvidence";
import {
  OperatorQueue,
  Run,
  SourceHealth,
  Schedules,
  Usage,
  Delivery,
} from "./Operations";
import { useErrors } from "./diagnostics";
import { WeeklyBrief } from "./WeeklyBrief";

function Guide() {
  const { go } = useDemo();
  const [search, setSearch] = useState("");
  const errors = useErrors();
  const filtered = screens.filter(
    (s) =>
      s.id !== "guide" &&
      (s.name + " " + s.group + " " + s.purpose)
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const groups = [...new Set(filtered.map((s) => s.group))];
  return (
    <>
      <header className="guide-heading">
        <span className="eyebrow">INTERACTIVE PRODUCT WALKTHROUGH</span>
        <h1>A considered view of Procint.</h1>
        <p className="lead">
          Every customer and operator screen. The states in between, too.
        </p>
        <div className="guide-intro">
          <div>
            <h2>What your reviewer should know</h2>
            <p>
              Procint combines structured analysis, historical procurement data
              and monitoring of competitors and the commercial environment to
              help firms make better pursuit decisions. Evidence supports each
              conclusion; uncertainty remains visible.
            </p>
            <p>
              The design is selected; business rules remain proposals.
              Everything here uses fictional data and simulated processing.
              Detailed analytical methods and change-monitoring views are the
              next design priorities.
            </p>
          </div>
          <div>
            <strong>{screens.length - 1} product screens</strong>
            <span>
              {screens
                .filter((s) => s.id !== "guide")
                .reduce((n, s) => n + s.states.length, 0)}{" "}
              directly accessible screen states
            </span>
            <Button onClick={() => go("pursuit")}>
              Start with the pursuit workspace <I.ArrowRight size={17} />
            </Button>
            <Button kind="text" onClick={() => go("watchlist")}>
              Start with the end-to-end journey
            </Button>
          </div>
        </div>
      </header>
      <div className="guide-toolbar">
        <Search
          value={search}
          onChange={setSearch}
          placeholder="Find a screen or workflow"
        />
        <span className="muted">
          Use the bottom bar on any screen to change its state.
        </span>
      </div>
      {groups.map((group) => (
        <section className="catalogue-group" key={group}>
          <h2>{group}</h2>
          <div className="catalogue-grid">
            {filtered
              .filter((s) => s.group === group)
              .map((screen) => (
                <article key={screen.id}>
                  <button
                    className="catalogue-title"
                    onClick={() => go(screen.id)}
                  >
                    {screen.name}
                    <I.ArrowRight size={18} />
                  </button>
                  <p>{screen.purpose}</p>
                  <div className="state-links">
                    {screen.states.map((state) => (
                      <button key={state} onClick={() => go(screen.id, state)}>
                        {stateLabel(state)}
                      </button>
                    ))}
                  </div>
                </article>
              ))}
          </div>
        </section>
      ))}
      {!filtered.length && (
        <Empty
          title="No matching screens"
          description="Try another workflow or screen name."
        />
      )}
      <footer className="guide-footer">
        <span>Runtime errors captured: {errors.length}</span>
        {errors.length > 0 && <pre>{errors.join("\n")}</pre>}
        <Button kind="text" onClick={() => go("compare")}>
          Compare selected visual
        </Button>
        <span>Prototype date: 9 September 2026 · no live APIs or email</span>
      </footer>
    </>
  );
}
function Screen() {
  const { page } = useDemo();
  switch (page) {
    case "guide":
      return <Guide />;
    case "watchlist":
      return <Watchlist />;
    case "pursuit":
      return <Pursuit />;
    case "requirements":
      return <Requirements />;
    case "review":
      return <Review />;
    case "decisions":
      return <Decisions />;
    case "sources":
      return <Sources />;
    case "document":
      return (
        <div className="standalone-document">
          <Evidence />
        </div>
      );
    case "upload":
      return <Upload />;
    case "request":
      return <RequestAnalysis />;
    case "processing":
      return <Processing />;
    case "reports":
      return <ReportLibrary />;
    case "report":
      return <ReportReader />;
    case "sharing":
      return <Sharing />;
    case "shared":
      return <ReportReader shared />;
    case "brief":
      return <WeeklyBrief />;
    case "market":
      return <Market />;
    case "agencies":
      return <Directory />;
    case "agency":
      return <EntityProfile />;
    case "competitors":
      return <Directory competitors />;
    case "competitor":
      return <EntityProfile competitor />;
    case "awards":
      return <Awards />;
    case "signal":
      return <Signal />;
    case "renewals":
      return <Renewals />;
    case "firm":
      return <Firm />;
    case "preferences":
      return <Preferences />;
    case "access":
      return <Access />;
    case "onboarding":
      return <Firm onboarding />;
    case "ops":
      return <OperatorQueue />;
    case "run":
      return <Run />;
    case "source-health":
      return <SourceHealth />;
    case "source-detail":
      return <SourceHealth detail />;
    case "schedules":
      return <Schedules />;
    case "usage":
      return <Usage />;
    case "delivery":
      return <Delivery />;
    default:
      return (
        <Empty
          title="Screen not found"
          description="Use the screen guide to choose an available prototype."
        />
      );
  }
}
function Comparison() {
  const [width, setWidth] = useState(window.innerWidth);
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const resize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  const scale = Math.min(1, (width - 64) / 2 / 1440);
  return (
    <div className="comparison">
      <div className="comparison-heading">
        <h2>Selected visual / rendered implementation</h2>
        <Button kind="secondary" onClick={() => setMobile(!mobile)}>
          {mobile ? "Compare desktop" : "Inspect 390px responsive view"}
        </Button>
        <a href="#/guide">Back to screen guide</a>
      </div>
      {mobile ? (
        <iframe
          className="mobile-preview"
          title="390px responsive prototype"
          src={location.pathname + "#/pursuit?chrome=0"}
          width="390"
          height="844"
        />
      ) : (
        <div className="comparison-columns">
          <section>
            <h3>Selected reference · normalised to 1440px wide</h3>
            <div style={{ height: 1024 * scale }}>
              <img
                src="./reference.png"
                alt="Selected Pursuit Room visual"
                style={{
                  width: 1440,
                  transform: "scale(" + scale + ")",
                  transformOrigin: "top left",
                }}
              />
            </div>
          </section>
          <section>
            <h3>Live prototype · 1440 × 1024 CSS viewport</h3>
            <div style={{ height: 1024 * scale }}>
              <iframe
                title="Rendered pursuit workspace"
                src={location.pathname + "#/pursuit?chrome=0"}
                width="1440"
                height="1024"
                style={{
                  transform: "scale(" + scale + ")",
                  transformOrigin: "top left",
                }}
              />
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
function Shell() {
  const { demo, setDemo, page, scene, params, go, toast, notify } = useDemo();
  const meta = screens.find((s) => s.id === page);
  const operator = meta?.group === "Operations";
  const publicView = ["shared", "access", "onboarding"].includes(page);
  const hideChrome = params.get("chrome") === "0";
  const nav = operator
    ? [
        ["Work queue", "ops"],
        ["Source health", "source-health"],
        ["Delivery", "delivery"],
      ]
    : [
        ["Watchlist", "watchlist"],
        ["Market", "market"],
        ["Reports", "reports"],
      ];
  const group = meta?.group;
  const active =
    group === "Market"
      ? "market"
      : group === "Reports"
        ? "reports"
        : operator
          ? page
          : "watchlist";
  useEffect(() => {
    document.title = "Procint · " + (meta?.name || "Prototype");
  }, [meta]);
  if (page === "compare") return <Comparison />;
  return (
    <>
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("main-content")?.focus();
        }}
      >
        Skip to content
      </a>
      <header className="topbar">
        <button
          className="wordmark"
          onClick={() => go(publicView ? page : "watchlist")}
        >
          Procint
        </button>
        {operator && <Badge>Operations</Badge>}
        {publicView ? (
          <span className="public-view-label">
            {page === "shared"
              ? "Shared report · read only"
              : "Firm workspace · sign-in preview"}
          </span>
        ) : (
          <>
            <nav aria-label="Main navigation">
              {nav.map(([label, id]) => (
                <button
                  key={id}
                  className={active === id ? "active" : ""}
                  onClick={() => go(id)}
                >
                  {label}
                </button>
              ))}
            </nav>
            <details className="account-menu" key={page}>
              <summary>
                <span>
                  {operator ? "Service operator" : demo.firm + " · Demo"}
                </span>
                <I.Caret size={16} />
                <span className="avatar">{operator ? "OP" : "KA"}</span>
              </summary>
              <div className="account-popover">
                <strong>
                  {operator ? "Operator demo" : "Your firm workspace"}
                </strong>
                <button onClick={() => go("firm")}>
                  <I.Buildings />
                  Firm profile
                </button>
                <button onClick={() => go("preferences")}>
                  <I.Email />
                  Delivery preferences
                </button>
                <button onClick={() => go(operator ? "watchlist" : "ops")}>
                  <I.Settings />
                  {operator ? "Customer workspace" : "Operator workspace"}
                </button>
                <button onClick={() => go("guide")}>
                  <I.List />
                  All screens & states
                </button>
                <button onClick={() => go("access")}>
                  <I.SignOut />
                  Preview sign-in
                </button>
              </div>
            </details>
          </>
        )}
      </header>
      <main
        id="main-content"
        data-screen={page}
        data-state={scene}
        tabIndex={-1}
        className={"app-main " + (hideChrome ? "clean-capture" : "")}
      >
        <Screen key={page + scene + params.toString()} />
      </main>
      {toast && (
        <div className="toast" role="status">
          <I.CheckCircle size={18} />
          {toast}
        </div>
      )}
      {!hideChrome && (
        <footer className="prototype-bar" aria-label="Prototype controls">
          <button
            className="prototype-home"
            aria-label="Prototype guide"
            onClick={() => go("guide")}
          >
            <I.List size={18} />
            <strong>Prototype guide</strong>
          </button>
          <span className="demo-label">Fictional data</span>
          <label>
            Screen
            <select
              aria-label="Prototype screen"
              value={page}
              onChange={(e) => go(e.target.value)}
            >
              {[...new Set(screens.map((s) => s.group))].map((g) => (
                <optgroup key={g} label={g}>
                  {screens
                    .filter((s) => s.group === g)
                    .map((s) => (
                      <option value={s.id} key={s.id}>
                        {s.name}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label>
            State
            <select
              aria-label="Prototype state"
              value={scene}
              onChange={(e) =>
                go(
                  page,
                  e.target.value,
                  Object.fromEntries(
                    [...params].filter(([key]) => key !== "state"),
                  ),
                )
              }
            >
              {(meta?.states || ["normal"]).map((s) => (
                <option key={s} value={s}>
                  {stateLabel(s)}
                </option>
              ))}
            </select>
          </label>
          {page === "processing" ? (
            <Button
              kind="text"
              onClick={() => {
                setDemo((d) =>
                  advanceRequest(
                    d.request ? d : acceptRequest(d, "Notice-only assessment"),
                  ),
                );
                go("processing");
              }}
            >
              Advance demo <I.ArrowRight size={15} />
            </Button>
          ) : (
            <Button
              kind="text"
              onClick={() => {
                const index = screens.findIndex((s) => s.id === page);
                go(screens[(index + 1) % screens.length].id);
              }}
            >
              Next screen <I.ArrowRight size={15} />
            </Button>
          )}
          <button
            className="reset-demo"
            onClick={() => {
              setDemo(initialDemo());
              go(page);
              notify("Fictional demo state reset.");
            }}
          >
            Reset demo
          </button>
        </footer>
      )}
    </>
  );
}
class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: string }
> {
  state = { error: "" };
  static getDerivedStateFromError(error: Error) {
    return { error: error.message };
  }
  render() {
    if (this.state.error)
      return (
        <div className="fatal-error">
          <h1>The prototype hit an error.</h1>
          <p>{this.state.error}</p>
          <button
            onClick={() => {
              localStorage.removeItem("procint-demo-v1");
              location.href = location.pathname + "#/guide";
              location.reload();
            }}
          >
            Reset fictional demo
          </button>
        </div>
      );
    return this.props.children;
  }
}
export function App() {
  return (
    <ErrorBoundary>
      <DemoProvider>
        <Shell />
      </DemoProvider>
    </ErrorBoundary>
  );
}
