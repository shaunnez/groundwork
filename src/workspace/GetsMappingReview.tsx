import { useEffect, useState } from "react";
import { Button, Empty, Notice } from "../ui";
import { Heading } from "./Chrome";
import { request, type Navigate } from "./data";

type Field = {
  sourceLabel: string;
  sourceLocation: string;
  rawText: string | null;
  parsedValue: string | null;
  displayedValue: string | null;
  rule: string;
  ruleVersion: string;
  state: string;
  warnings: string[];
  humanOverride?: { value: string | null; reason: string };
};
type Row = {
  notice_id: string;
  rfx_id: string;
  opportunity_id: string;
  revision_id: string;
  fields: { title: string | null; url: string };
  mapping_id: string | null;
  version: number | null;
  trace: Record<string, Field> | null;
  flags: string[] | null;
  review_state: string | null;
  changed: boolean;
};
type Queue = { total: number; page: number; pageSize: number; rows: Row[] };
const fields = [
  "rfxId",
  "title",
  "buyer",
  "noticeType",
  "status",
  "openedAt",
  "closesAt",
  "category",
  "region",
  "overview",
];
const filters = [
  ["all", "All"],
  ["missing", "Missing"],
  ["changed", "Changed"],
  ["conflicting", "Conflicting"],
  ["unusual", "Unusual"],
  ["unknown-sector", "Unknown sector"],
  ["reviewed", "Reviewed"],
] as const;

export function GetsMappingReview({
  go,
  owner,
}: {
  go: Navigate;
  owner: boolean;
}) {
  const [filter, setFilter] = useState("all"),
    [page, setPage] = useState(1),
    [data, setData] = useState<Queue | null>(null),
    [selected, setSelected] = useState(""),
    [field, setField] = useState("title"),
    [value, setValue] = useState(""),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  async function load() {
    setData(
      await request<Queue>(
        `/gets/mappings?filter=${encodeURIComponent(filter)}&page=${page}`,
      ),
    );
  }
  useEffect(() => {
    let live = true;
    void request<Queue>(
      `/gets/mappings?filter=${encodeURIComponent(filter)}&page=${page}`,
    )
      .then((result) => {
        if (live) setData(result);
      })
      .catch((e: Error) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [filter, page]);
  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await fn();
      await load();
      setMessage(typeof result === "object" ? JSON.stringify(result) : "Saved");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Heading
        go={go}
        eyebrow="OWNER REVIEW"
        title="Inspect GETS field mapping"
        description="Trace each displayed value to the saved GETS notice and its parser rule."
        back={{ label: "Reviewer tools", page: "ops" }}
      />
      <section className="connected-panel">
        <p>
          Raw GETS values and notice revisions remain unchanged. Corrections
          create a new mapping version and update the current opportunity
          projection; saved reports retain their original evidence.
        </p>
        {owner && (
          <Button
            kind="secondary"
            disabled={busy}
            onClick={() =>
              void act(() => request("/gets/mappings/backfill", { limit: 25 }))
            }
          >
            Backfill next 25 saved notices
          </Button>
        )}
        {message && <p role="status">{message}</p>}
        {error && (
          <Notice title="Mapping review could not continue" tone="warning">
            {error}
          </Notice>
        )}
        <div className="filter-row">
          <label>
            Review queue{" "}
            <select
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value);
                setPage(1);
              }}
            >
              {filters.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <span>{data?.total ?? "…"} matching notices</span>
        </div>
        {!data ? (
          <p>Loading saved mappings…</p>
        ) : !data.rows.length ? (
          <Empty
            title="No notices in this view"
            description="Choose another filter or backfill saved notice mappings."
          />
        ) : (
          <div className="mapping-list">
            {data.rows.map((row) => (
              <article className="mapping-row" key={row.revision_id}>
                <div className="section-heading">
                  <div>
                    <strong>
                      RFx {row.rfx_id} · {row.fields.title || "Title missing"}
                    </strong>
                    <p className="small muted">
                      Mapping v{row.version ?? "unrecorded"} ·{" "}
                      {row.review_state || "needs backfill"}
                      {row.changed ? " · changed notice" : ""}
                    </p>
                  </div>
                  <a
                    href={row.fields.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Original GETS notice
                  </a>
                </div>
                {row.flags?.length ? (
                  <p className="small" role="status">
                    {row.flags.join(" · ")}
                  </p>
                ) : (
                  <p className="small muted">No parser exceptions recorded.</p>
                )}
                <details>
                  <summary>Inspect source fields and projection</summary>
                  {!row.trace ? (
                    <p>Backfill this notice to record field provenance.</p>
                  ) : (
                    <div className="mapping-fields">
                      {fields.map((key) => {
                        const trace = row.trace?.[key];
                        return (
                          <div className="mapping-field" key={key}>
                            <strong>{key}</strong>
                            <span>{trace?.state || "unresolved"}</span>
                            <p>
                              GETS {trace?.sourceLabel || "label missing"} ·{" "}
                              {trace?.sourceLocation || "location missing"}
                            </p>
                            <p>
                              <b>Raw:</b> {trace?.rawText || "Missing"}
                            </p>
                            <p>
                              <b>Parsed:</b>{" "}
                              {trace?.parsedValue || "Unresolved"}
                            </p>
                            <p>
                              <b>Displayed:</b>{" "}
                              {trace?.displayedValue || "Unresolved"}
                            </p>
                            <small>
                              {trace?.rule} · {trace?.ruleVersion}
                            </small>
                            {trace?.warnings.map((warning) => (
                              <p key={warning} className="small">
                                {warning}
                              </p>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </details>
                {owner && row.trace && (
                  <div className="mapping-actions">
                    <Button
                      kind="text"
                      disabled={busy}
                      onClick={() => {
                        setSelected(row.revision_id);
                        setField("title");
                        setValue(row.trace?.title?.displayedValue || "");
                        setReason("");
                      }}
                    >
                      Correct or review
                    </Button>
                    <Button
                      kind="text"
                      onClick={() => go("pursuit", row.opportunity_id)}
                    >
                      Open pursuit
                    </Button>
                  </div>
                )}
                {owner && selected === row.revision_id && (
                  <form
                    className="connected-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void act(async () => {
                        await request(
                          `/gets/mappings/${row.revision_id}/correct`,
                          { field, value: value.trim() || null, reason },
                        );
                        setSelected("");
                        return "Mapping correction saved";
                      });
                    }}
                  >
                    <label>
                      Field{" "}
                      <select
                        value={field}
                        onChange={(e) => {
                          setField(e.target.value);
                          setValue(
                            row.trace?.[e.target.value]?.displayedValue || "",
                          );
                        }}
                      >
                        {fields
                          .filter((key) => key !== "rfxId")
                          .map((key) => (
                            <option key={key}>{key}</option>
                          ))}
                      </select>
                    </label>
                    <label>
                      Corrected displayed value{" "}
                      <textarea
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        rows={field === "overview" ? 4 : 2}
                      />
                    </label>
                    <label>
                      Reason and source check{" "}
                      <textarea
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        minLength={10}
                        maxLength={1000}
                        required
                      />
                    </label>
                    <div className="inline">
                      <Button disabled={busy} type="submit">
                        Save correction
                      </Button>
                      <Button
                        kind="secondary"
                        type="button"
                        disabled={busy || reason.length < 10}
                        onClick={() =>
                          void act(async () => {
                            await request(
                              `/gets/mappings/${row.revision_id}/review`,
                              { reason },
                            );
                            setSelected("");
                            return "Mapping review recorded";
                          })
                        }
                      >
                        Mark reviewed without correction
                      </Button>
                    </div>
                  </form>
                )}
              </article>
            ))}
          </div>
        )}
        {data && data.total > data.pageSize && (
          <div className="inline">
            <Button
              kind="secondary"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </Button>
            <span>
              Page {page} of {Math.ceil(data.total / data.pageSize)}
            </span>
            <Button
              kind="secondary"
              disabled={page * data.pageSize >= data.total}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </section>
    </>
  );
}
