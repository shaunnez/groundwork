import { Badge, Button, Empty, Notice } from "../ui";
import { Heading } from "./Chrome";
import {
  request,
  date,
  kindLabel,
  type Bootstrap,
  type Navigate,
  type SavedReport,
  type Detail,
} from "./data";
import type { Action } from "./Workflows";
export function DecisionsView({
  report,
  detail,
  go,
  action,
  busy,
  onRefresh,
  reviewer = false,
  onEvidence,
}: {
  report: SavedReport | null;
  detail: Detail;
  go: Navigate;
  action: Action;
  busy: boolean;
  onRefresh: () => Promise<void>;
  reviewer?: boolean;
  onEvidence: (id: string, quote?: string) => void;
}) {
  if (!report)
    return (
      <Empty
        title="An assessment comes first"
        description="Generate a pursuit package before recording a decision against it."
        action={
          <Button onClick={() => go("request", detail.opportunity.id)}>
            Request assessment
          </Button>
        }
      />
    );
  return (
    <>
      <Heading
        go={go}
        eyebrow={reviewer ? "BIDEDGE REVIEW" : "YOUR FIRM’S DECISION"}
        title={
          reviewer
            ? "Check the evidence. Record the review."
            : "Decide with a clear view."
        }
        description={detail.opportunity.title}
        actions={
          <Button
            kind="secondary"
            onClick={() => go("report", detail.opportunity.id, report.id)}
          >
            Read this report
          </Button>
        }
      />
      <div className="two-col connected-form-layout">
        <section className="connected-panel">
          <h2>{reviewer ? "Internal review" : "Record your decision"}</h2>
          <p>
            {reviewer
              ? "Review is attributed to the signed-in local reviewer. Approval enables internal delivery only."
              : "Your decision and rationale stay separate from the system’s recommendation."}
          </p>
          <form
            className="connected-form"
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget,
                f = new FormData(form);
              void action(
                async () => {
                  await request(
                    "/reports/" +
                      report.id +
                      (reviewer ? "/review" : "/decision"),
                    reviewer
                      ? { state: f.get("choice"), reason: f.get("reason") }
                      : { choice: f.get("choice"), reason: f.get("reason") },
                  );
                  await onRefresh();
                  form.reset();
                },
                reviewer ? "Review recorded." : "Your decision has been saved.",
              );
            }}
          >
            <label>
              {reviewer ? "Review decision" : "Your decision"}
              <select name="choice">
                {(reviewer
                  ? [
                      ["approved", "Approve for internal delivery"],
                      ["changes-requested", "Request corrections"],
                    ]
                  : [
                      ["pursue", "Pursue"],
                      ["watch", "Watch"],
                      ["pass", "Pass"],
                    ]
                ).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Decision rationale
              <textarea name="reason" minLength={3} rows={4} required />
            </label>
            <Button type="submit" disabled={busy}>
              {reviewer ? "Record review" : "Save decision"}
            </Button>
          </form>
          <h3 className="section-gap">
            {reviewer ? "Review history" : "Your decision history"}
          </h3>
          {(reviewer ? report.reviewHistory : report.decisions).length ? (
            reviewer ? (
              report.reviewHistory.map((r) => (
                <article className="change-row" key={r.id}>
                  <Badge>{r.state.replaceAll("-", " ")}</Badge>
                  <p>{r.reason}</p>
                  <small>{date(r.created_at)}</small>
                </article>
              ))
            ) : (
              report.decisions.map((d) => (
                <article className="change-row" key={d.id}>
                  <Badge>{d.choice}</Badge>
                  <p>{d.reason}</p>
                  <small>{date(d.created_at)}</small>
                </article>
              ))
            )
          ) : (
            <p className="muted">
              No decision recorded for this report version.
            </p>
          )}
          {reviewer && (
            <>
              <Button
                kind="secondary"
                disabled={
                  busy ||
                  report.freshness.stale ||
                  report.review?.state !== "approved" ||
                  report.freshness.upstreamReviewState !== "approved"
                }
                onClick={() =>
                  void action(async () => {
                    await request(
                      "/reports/" + report.id + "/deliver-local",
                      {},
                    );
                    await onRefresh();
                  }, "This report is in the local inbox.")
                }
              >
                Deliver to local inbox
              </Button>
              <p className="small muted">
                This report and its underlying pursuit must both be current and
                approved.
              </p>
            </>
          )}
        </section>
        <aside className="pursuit-rail">
          <span className="eyebrow">ASSESSMENT RECOMMENDATION</span>
          <h2>{report.payload.assessment.verdict.recommendation}</h2>
          <p>{report.payload.summarySentences[2]}</p>
          <p className="small">
            As at {date(report.payload.cutoff)} · Saved{" "}
            {date(report.created_at)}
          </p>
          {report.freshness.stale && (
            <Notice title="Newer evidence is available">
              Review the latest assessment before committing.
            </Notice>
          )}
          <Badge>
            {report.review?.state === "approved"
              ? "Internally reviewed"
              : "Review outstanding"}
          </Badge>
        </aside>
      </div>
      <section className="connected-panel section-gap">
        <h2>Flag a correction or question</h2>
        <form
          className="connected-form"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget,
              f = new FormData(form);
            void action(async () => {
              await request("/reports/" + report.id + "/feedback", {
                target: f.get("target"),
                disposition: f.get("disposition"),
                reason: f.get("reason"),
              });
              await onRefresh();
              form.reset();
            }, "Feedback saved with this report.");
          }}
        >
          <div className="connected-fields">
            <label>
              Finding
              <select name="target">
                <option value="report">Whole report</option>
                {report.payload.assessment.claims.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.text.slice(0, 100)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Feedback type
              <select name="disposition">
                <option value="unclear">Needs clarification</option>
                <option value="correction">Correction requested</option>
                <option value="reject">Reject finding</option>
                <option value="accept">Accept finding</option>
              </select>
            </label>
          </div>
          <label>
            Feedback details
            <textarea name="reason" rows={3} required />
          </label>
          <Button type="submit" disabled={busy}>
            Save feedback
          </Button>
        </form>
        {report.feedback.map((f) => (
          <article className="change-row" key={f.id}>
            <Badge>{f.disposition}</Badge>
            <p>{f.reason}</p>
            {f.before_text && (
              <p className="small muted">Recorded finding: {f.before_text}</p>
            )}
          </article>
        ))}
      </section>
      <section className="connected-panel section-gap">
        <h2>Observed outcomes</h2>
        <p>
          Record what subsequently happened, supported by a source. This does
          not rewrite the original assessment.
        </p>
        <form
          className="connected-form"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget,
              f = new FormData(form);
            void action(async () => {
              await request("/reports/" + report.id + "/outcomes", {
                event: f.get("event"),
                outcome: f.get("outcome"),
                observedAt: f.get("date"),
                unitId: f.get("unit"),
              });
              await onRefresh();
              form.reset();
            }, "Sourced outcome saved.");
          }}
        >
          <div className="connected-fields">
            <label>
              Event being tracked
              <input name="event" minLength={3} required />
            </label>
            <label>
              Observation date
              <input name="date" type="date" required />
            </label>
          </div>
          <label>
            Observed result
            <textarea name="outcome" minLength={3} required />
          </label>
          <label>
            Supporting evidence
            <select name="unit" required>
              <option value="">Choose a cited source</option>
              {report.payload.assessment.evidence.map((e) => (
                <option key={e.id} value={e.unitId}>
                  {e.excerpt.slice(0, 110)}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" disabled={busy}>
            Record sourced outcome
          </Button>
        </form>
        {report.outcomes.map((o) => (
          <article className="change-row" key={o.id}>
            <strong>{o.event}</strong>
            <p>
              {o.outcome} · {date(o.observed_at)}
            </p>
            <button className="citation" onClick={() => onEvidence(o.unit_id)}>
              Open supporting source
            </button>
          </article>
        ))}
      </section>
    </>
  );
}
export function ReviewQueue({ boot, go }: { boot: Bootstrap; go: Navigate }) {
  const pending = boot.reviews.filter((r) => r.state !== "approved");
  return (
    <>
      <Heading
        go={go}
        eyebrow="BIDEDGE OPERATIONS"
        title="Give the right work your attention."
        description="Review saved reports, inspect their evidence and record corrections."
        actions={
          <Button kind="secondary" onClick={() => go("delivery")}>
            Refresh & delivery
          </Button>
        }
      />
      <div className="list-heading">
        <strong>{pending.length} reports awaiting review or correction</strong>
        <span>Internal analyst review</span>
      </div>
      {!pending.length ? (
        <Empty
          title="The review queue is clear"
          description="New saved reports will appear here for review."
        />
      ) : (
        <div className="table-scroll">
          <table className="data-table connected-table">
            <caption className="sr-only">
              Reports awaiting internal review
            </caption>
            <thead>
              <tr>
                <th scope="col">Report</th>
                <th scope="col">Type</th>
                <th scope="col">Saved</th>
                <th scope="col">Status</th>
                <th scope="col">
                  <span className="sr-only">Action</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {pending.map((r) => (
                <tr key={r.id}>
                  <td data-label="Report">
                    <strong>{r.title}</strong>
                    {r.reasons.length > 0 && (
                      <details>
                        <summary>Review notes</summary>
                        <ul>
                          {r.reasons.map((reason, i) => (
                            <li key={i}>{reason}</li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </td>
                  <td data-label="Type">{kindLabel[r.kind]}</td>
                  <td data-label="Saved">{date(r.created_at)}</td>
                  <td data-label="Status">
                    <Badge tone="warning">
                      {r.state === "changes-requested"
                        ? "Corrections requested"
                        : "Needs review"}
                    </Badge>
                  </td>
                  <td className="table-action">
                    <Button
                      kind="secondary"
                      onClick={() => go("ops", r.opportunity_id, r.report_id)}
                    >
                      Review report
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
