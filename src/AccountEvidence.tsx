import { useState, type FormEvent } from "react";
import { useDemo } from "./context";
import { sources } from "./catalogue";
import {
  Badge,
  Button,
  Empty,
  I,
  Notice,
  PageHeader,
  StateBoundary,
} from "./ui";
export function Sources() {
  const { demo, scene, go } = useDemo();
  return (
    <>
      <PageHeader
        title="Evidence with its context intact."
        description="Original sources, recorded versions and the coverage behind an assessment."
        breadcrumb="Watchlist"
        actions={
          <Button onClick={() => go("upload")}>
            <I.Upload size={17} />
            Add documents
          </Button>
        }
      />
      <StateBoundary
        emptyTitle="No source documents yet"
        emptyDescription="Add the tender documents to begin a document-based assessment."
        emptyAction={
          <Button onClick={() => go("upload")}>Add sample documents</Button>
        }
      >
        {(!demo.coverageComplete || scene === "partial") && (
          <Notice title="Two pages need review">
            The requirement inventory is incomplete. A successful upload is not
            the same as complete evidence coverage.
          </Notice>
        )}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Source</th>
                <th>Origin / access</th>
                <th>Version</th>
                <th>Coverage</th>
                <th>Checked</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sources.map((s, i) => (
                <tr key={s.name}>
                  <td>
                    <button
                      className="table-title"
                      onClick={() =>
                        go("document", "normal", {
                          source: String(i),
                          page: i === 0 ? "12" : "1",
                        })
                      }
                    >
                      <I.File size={18} />
                      {s.name}
                    </button>
                  </td>
                  <td>
                    {s.kind}
                    <small>
                      <I.Lock size={12} />
                      {s.scope}
                    </small>
                  </td>
                  <td>v{s.version}</td>
                  <td>
                    <Badge
                      tone={
                        i === 0 && !demo.coverageComplete
                          ? "warning"
                          : "success"
                      }
                    >
                      {i === 0 && demo.coverageComplete
                        ? "18 / 18"
                        : s.read + " / " + s.pages}{" "}
                      readable
                    </Badge>
                  </td>
                  <td>{s.checked}</td>
                  <td>
                    <Button
                      kind="text"
                      onClick={() =>
                        go(
                          "document",
                          i === 0 && !demo.coverageComplete
                            ? "partial"
                            : "normal",
                          { source: String(i), page: i === 0 ? "17" : "1" },
                        )
                      }
                    >
                      {i === 0 && !demo.coverageComplete
                        ? "Review gaps"
                        : "Open"}
                      <I.ArrowRight size={16} />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="section-heading">
          <span className="muted">
            Firm uploads remain private. Public sources retain their publisher
            and captured version.
          </span>
          <Button kind="text" onClick={() => go("pursuit")}>
            Return to assessment <I.ArrowRight size={16} />
          </Button>
        </div>
      </StateBoundary>
    </>
  );
}
export function Upload() {
  const { demo, setDemo, scene, go, notify } = useDemo();
  const [files, setFiles] = useState<string[]>(
    scene === "normal"
      ? demo.files
      : ["Tender requirements.pdf", "Koru capability statement.docx"],
  );
  const [phase, setPhase] = useState(scene);
  const [error, setError] = useState(scene === "error");
  const add = () => {
    setFiles(["Tender requirements.pdf", "Koru capability statement.docx"]);
    setPhase("uploading");
    setTimeout(() => setPhase("processing"), 900);
  };
  const accept = () => {
    setPhase("complete");
    setDemo((d) => ({ ...d, files, coverageComplete: true }));
    notify("Sample documents processed. Requirement reviews remain separate.");
  };
  return (
    <>
      <PageHeader
        title="Give the assessment its evidence."
        description="Add tender documents and inspect the outcome for every file."
        breadcrumb="Watchlist"
      />
      <div className="two-col">
        <section className="form-surface">
          <div className="upload-area">
            <I.Upload size={40} weight="light" />
            <h2>Add source documents</h2>
            <p>PDF and DOCX · sample documents only</p>
            <Button onClick={add}>Choose sample documents</Button>
            <small>No real files are uploaded or processed.</small>
          </div>
          <Button
            kind="text"
            onClick={() => {
              setFiles((v) => [...v, "Legacy document.doc"]);
              setError(true);
              setPhase("partial");
            }}
          >
            Preview an unsupported file
          </Button>
          {error && (
            <Notice title="One document could not be accepted" tone="error">
              Legacy .doc is unsupported. Convert it to DOCX or PDF. Accepted
              files remain available.
            </Notice>
          )}
          <div className="upload-files">
            {files.map((file, i) => (
              <article className="simple-row" key={file}>
                <I.File size={24} />
                <div>
                  <strong>{file}</strong>
                  <small>
                    {file.endsWith(".doc")
                      ? "Unsupported format"
                      : phase === "uploading"
                        ? "Storing original bytes…"
                        : phase === "processing"
                          ? "Reading pages and tables…"
                          : phase === "partial" && i === 0
                            ? "2 scanned pages need review"
                            : "Private · " + (i === 0 ? "18 pages" : "8 pages")}
                  </small>
                </div>
                <Badge
                  tone={
                    file.endsWith(".doc")
                      ? "error"
                      : phase === "complete"
                        ? "success"
                        : "warning"
                  }
                >
                  {file.endsWith(".doc")
                    ? "Rejected"
                    : phase === "complete"
                      ? "Readable"
                      : phase === "uploading"
                        ? "Uploading"
                        : phase === "processing"
                          ? "Processing"
                          : "Needs review"}
                </Badge>
                <button
                  className="icon-button"
                  aria-label={"Remove " + file}
                  onClick={() => {
                    const remaining = files.filter((f) => f !== file);
                    setFiles(remaining);
                    setError(remaining.some((f) => f.endsWith(".doc")));
                  }}
                >
                  <I.X size={18} />
                </button>
              </article>
            ))}
          </div>
          {phase === "processing" && (
            <Notice title="Extraction is in progress" tone="info">
              Page coverage will be shown separately from upload completion.
            </Notice>
          )}
          {phase === "complete" && (
            <Notice title="Sample documents are ready" tone="success">
              All required sample pages are readable. Eligibility still requires
              an evidence review.
            </Notice>
          )}
          <div className="form-actions">
            <Button kind="secondary" onClick={() => go("sources")}>
              Back to sources
            </Button>
            {phase === "complete" ? (
              <Button onClick={() => go("request")}>
                Review request inputs
              </Button>
            ) : (
              <Button
                disabled={
                  !files.length ||
                  files.some((f) => f.endsWith(".doc")) ||
                  phase === "uploading"
                }
                onClick={accept}
              >
                Complete sample extraction
              </Button>
            )}
          </div>
        </section>
        <aside>
          <h2>What happens next</h2>
          <ol className="explain-list">
            <li>
              <strong>Store the original</strong>
              <p>Keep the file and its version, owner and origin.</p>
            </li>
            <li>
              <strong>Read the contents</strong>
              <p>
                Extract text, tables and source locations. Show unreadable pages
                as gaps.
              </p>
            </li>
            <li>
              <strong>Review the scope</strong>
              <p>Confirm what to include before requesting an assessment.</p>
            </li>
          </ol>
          <Notice title="Uploading does not verify a document" tone="info">
            Firm-supplied evidence remains attributed to the firm. It does not
            become an authenticated government record.
          </Notice>
        </aside>
      </div>
    </>
  );
}
export function Firm({ onboarding = false }: { onboarding?: boolean }) {
  const { demo, setDemo, scene, go } = useDemo();
  const [name, setName] = useState(scene === "empty" ? "" : demo.firm);
  const [services, setServices] = useState(
    scene === "empty" ? "" : demo.services,
  );
  const [region, setRegion] = useState(demo.region);
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(scene === "success");
  const [error, setError] = useState(scene === "error");
  const save = (e: FormEvent) => {
    e.preventDefault();
    if (onboarding && step === 1) {
      setStep(2);
      return;
    }
    setBusy(true);
    setTimeout(() => {
      setBusy(false);
      setDemo((d) => ({
        ...d,
        firm: name.trim(),
        services,
        region,
        changed: !onboarding,
      }));
      setSaved(true);
      setError(false);
    }, 550);
  };
  return (
    <>
      <PageHeader
        staticBreadcrumb={onboarding}
        title={
          onboarding
            ? "Start with your firm."
            : "A clearer picture of your firm."
        }
        description={
          onboarding
            ? "Tell us where you work and what you do. Your first watchlist starts here."
            : "Your interests guide matching. Your evidence informs an assessment."
        }
      />
      {scene === "loading" ? (
        <StateBoundary>
          <span />
        </StateBoundary>
      ) : (
        <div className="two-col">
          <form className="form-surface" onSubmit={save}>
            {onboarding && (
              <div className="step-label">
                Step {step} of 2 ·{" "}
                {step === 1 ? "Your firm" : "Interests & capabilities"}
              </div>
            )}
            {error && (
              <Notice title="Your changes could not be saved" tone="error">
                Your entries are preserved. Save again to retry.
              </Notice>
            )}
            {saved && (
              <Notice
                title={
                  onboarding ? "Your demo firm is ready" : "Firm profile saved"
                }
                tone="success"
              >
                {onboarding
                  ? "Open your personalised sample watchlist."
                  : "Assessments using an earlier profile are marked for review."}
              </Notice>
            )}
            {(!onboarding || step === 1) && (
              <>
                <label>
                  Firm name
                  <input
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      setSaved(false);
                    }}
                    required
                    placeholder="Your firm name"
                  />
                </label>
                <label>
                  Primary region
                  <select
                    value={region}
                    onChange={(e) => {
                      setRegion(e.target.value);
                      setSaved(false);
                    }}
                  >
                    {["Auckland", "Wellington", "Nationwide"].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </label>
              </>
            )}
            {(!onboarding || step === 2) && (
              <>
                <label>
                  Services and capabilities
                  <textarea
                    rows={5}
                    value={services}
                    onChange={(e) => {
                      setServices(e.target.value);
                      setSaved(false);
                    }}
                    required
                    placeholder="Describe services, sectors and relevant delivery experience."
                  />
                </label>
                <div className="field-heading">
                  <h3>Supporting evidence</h3>
                  <Button
                    type="button"
                    kind="text"
                    onClick={() => go("upload")}
                  >
                    Manage documents
                  </Button>
                </div>
                <div className="simple-row">
                  <I.File size={22} />
                  <span>Koru capability statement.pdf</span>
                  <Badge>Private · v1</Badge>
                </div>
                <p className="muted small">
                  Unverified or missing capabilities remain unknown in the
                  assessment.
                </p>
              </>
            )}
            <div className="form-actions">
              {onboarding && step === 2 && (
                <Button
                  kind="secondary"
                  type="button"
                  onClick={() => setStep(1)}
                >
                  Back
                </Button>
              )}
              {saved && onboarding ? (
                <Button type="button" onClick={() => go("watchlist")}>
                  Open watchlist
                </Button>
              ) : (
                <Button type="submit" disabled={busy || scene === "saving"}>
                  {busy || scene === "saving"
                    ? "Saving…"
                    : onboarding
                      ? step === 1
                        ? "Continue"
                        : "Create demo firm"
                      : "Save firm profile"}
                </Button>
              )}
            </div>
          </form>
          <aside>
            <h2>Relevance has a reason.</h2>
            <p className="lead">
              Your stated services and regions help explain why an opportunity
              may fit.
            </p>
            <p>
              Private capability evidence can support a review. A firm name or a
              promising market position cannot establish mandatory eligibility.
            </p>
            <Notice title="Your firm's context stays private" tone="info">
              Uploads and assessments belong to the firm shown in the account
              menu. This prototype demonstrates that boundary; it does not
              implement real access control.
            </Notice>
          </aside>
        </div>
      )}
    </>
  );
}
export function Preferences() {
  const { demo, setDemo, scene } = useDemo();
  const [values, setValues] = useState(demo.preferences);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(scene === "success");
  const [error, setError] = useState(scene === "error");
  const save = (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setTimeout(() => {
      setBusy(false);
      setDemo((d) => ({ ...d, preferences: values }));
      setError(false);
      setSaved(true);
    }, 450);
  };
  return (
    <>
      <PageHeader
        title="Useful updates, on your terms."
        description="Choose what reaches your inbox. Reports remain available in the portal."
      />
      <StateBoundary inlineError>
        <form className="form-surface narrow" onSubmit={save}>
          {error && (
            <Notice title="Preferences could not be saved" tone="error">
              Your selections have been kept. Try saving again.
            </Notice>
          )}
          {saved && (
            <Notice title="Delivery preferences saved" tone="success">
              No notifications are sent from this prototype.
            </Notice>
          )}
          {(
            [
              {
                key: "brief",
                title: "Weekly intelligence brief",
                text: "A weekly summary of relevant notices, changes and signals.",
              },
              {
                key: "deadlines",
                title: "Important opportunity changes",
                text: "Deadline extensions, withdrawals and relevant addenda.",
              },
              {
                key: "reports",
                title: "Report ready notifications",
                text: "An update after a report has been published successfully.",
              },
            ] as const
          ).map((item) => (
            <label className="preference-row" key={item.key}>
              <span>
                <strong>{item.title}</strong>
                <small>{item.text}</small>
              </span>
              <input
                type="checkbox"
                checked={values[item.key]}
                onChange={(e) => {
                  setValues((v) => ({ ...v, [item.key]: e.target.checked }));
                  setSaved(false);
                }}
              />
            </label>
          ))}
          <div className="simple-row">
            <I.Clock size={20} />
            <div>
              <strong>Pacific/Auckland</strong>
              <small>
                Schedules follow Auckland local time, including daylight saving.
              </small>
            </div>
          </div>
          <div className="form-actions">
            <Button type="submit" disabled={busy || scene === "saving"}>
              {busy || scene === "saving"
                ? "Saving preferences…"
                : "Save preferences"}
            </Button>
          </div>
        </form>
      </StateBoundary>
    </>
  );
}
export function Access() {
  const { scene, go } = useDemo();
  const [email, setEmail] = useState("alex@example.test");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(scene === "success");
  const [error, setError] = useState(scene === "error" || scene === "expired");
  return (
    <div className="access-layout">
      <div className="access-copy">
        <span className="eyebrow">PROCUREMENT INTELLIGENCE</span>
        <h1>
          Better evidence.
          <br />
          Clearer decisions.
        </h1>
        <p>
          Find relevant opportunities. Understand the requirements. Make a
          considered call.
        </p>
      </div>
      <form
        className="form-surface"
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          setTimeout(() => {
            setBusy(false);
            setSent(true);
            setError(false);
          }, 500);
        }}
      >
        <h2>{sent ? "Your demo link is ready" : "Welcome to Procint"}</h2>
        {error && (
          <Notice
            title={
              scene === "expired"
                ? "This sign-in link has expired"
                : "We couldn’t prepare your sign-in link"
            }
            tone="error"
          >
            Request a new demo link to continue.
          </Notice>
        )}
        {sent ? (
          <>
            <Notice title="Sign-in confirmation preview" tone="success">
              No email was sent. This preview does not authenticate an account.
            </Notice>
            <Button onClick={() => go("watchlist")}>Open demo workspace</Button>
            <Button kind="text" onClick={() => go("onboarding")}>
              Preview new-firm setup
            </Button>
          </>
        ) : (
          <>
            <p>Preview the passwordless sign-in journey.</p>
            <label>
              Email address
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            <Button type="submit" disabled={busy || scene === "submitting"}>
              {busy || scene === "submitting"
                ? "Preparing link…"
                : "Prepare demo sign-in link"}
            </Button>
            <p className="muted small">
              Use fictional details. No credentials, account creation or email
              delivery.
            </p>
          </>
        )}
      </form>
    </div>
  );
}
