import { useEffect, useState } from "react";
import { Button, Notice } from "../ui";
import { Heading } from "./Chrome";
import { request, type Navigate } from "./data";

type Sector = {
  id: string;
  name: string;
  keywords: string[];
  status: "active" | "archived";
  assigned_count: number;
};
type Assignment = {
  opportunity_id: string;
  title: string;
  notice_id: string;
  sector_id: string | null;
  method: string;
  taxonomy_version: number;
  classifier_version: string;
  notice_revision_id: string | null;
  reason: string;
  evidence_pointer: string | null;
};
type State = {
  taxonomyVersion: number;
  sectors: Sector[];
  assignments: Assignment[];
  totalOpportunities: number;
};
export function SectorSettings({
  go,
  owner,
  onSaved,
}: {
  go: Navigate;
  owner: boolean;
  onSaved: () => Promise<void>;
}) {
  const [data, setData] = useState<State | null>(null),
    [name, setName] = useState(""),
    [keywords, setKeywords] = useState(""),
    [selected, setSelected] = useState(""),
    [choice, setChoice] = useState(""),
    [reason, setReason] = useState(""),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(1),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  async function load() {
    setData(await request<State>("/sectors"));
  }
  useEffect(() => {
    let live = true;
    void request<State>("/sectors")
      .then((result) => {
        if (live) setData(result);
      })
      .catch((e: Error) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, []);
  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await fn();
      await load();
      await onSaved();
      setMessage(JSON.stringify(result));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const sectors = data?.sectors ?? [];
  const rows = (data?.assignments ?? []).filter((row) =>
    `${row.title} ${row.notice_id}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <>
      <Heading
        go={go}
        eyebrow="OWNER SETTINGS"
        title="Groundwork sectors"
        description="Keep GETS source categories separate from your editable primary sector."
        back={{ label: "Reviewer tools", page: "ops" }}
      />
      <section className="connected-panel">
        <p>
          Unknown is a valid assignment. Versioned rules use the saved title,
          GETS category and overview, then owner-edited sector keywords when
          needed. Ambiguous notices stay Unknown; these assignments are a
          reviewable baseline, not a validated model classification.
        </p>
        <p className="small">
          Taxonomy version {data?.taxonomyVersion ?? "…"} ·{" "}
          {data?.totalOpportunities ?? "…"} tracked opportunities ·{" "}
          {data?.assignments.length ?? "…"} assignments recorded.
        </p>
        {error && (
          <Notice title="Sector change failed" tone="warning">
            {error}
          </Notice>
        )}
        {message && <p role="status">{message}</p>}
        {owner && (
          <form
            className="connected-form"
            onSubmit={(e) => {
              e.preventDefault();
              void act(async () => {
                const result = await request("/sectors", {
                  name,
                  keywords: keywords
                    .split(",")
                    .map((part) => part.trim())
                    .filter(Boolean),
                });
                setName("");
                setKeywords("");
                return result;
              });
            }}
          >
            <h2>Add a sector</h2>
            <label>
              Sector name
              <input
                required
                minLength={3}
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label>
              High precision matching phrases, comma separated (optional)
              <input
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                placeholder="Only phrases you have reviewed"
              />
            </label>
            <Button type="submit" disabled={busy}>
              Add sector
            </Button>
          </form>
        )}
        <div className="sector-list">
          {sectors.map((sector) => (
            <article key={sector.id} className="sector-row">
              <div>
                <strong>{sector.name}</strong> · {sector.status} ·{" "}
                {sector.assigned_count} assigned
                <p className="small muted">
                  Rule phrases: {sector.keywords.join(", ") || "none"}
                </p>
              </div>
              {owner && (
                <details>
                  <summary>Edit or archive</summary>
                  <form
                    className="connected-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const form = new FormData(e.currentTarget);
                      void act(() =>
                        request(`/sectors/${sector.id}`, {
                          name: String(form.get("name")),
                          keywords: String(form.get("keywords") || "")
                            .split(",")
                            .map((word) => word.trim())
                            .filter(Boolean),
                          archived: form.get("archived") === "on",
                        }),
                      );
                    }}
                  >
                    <label>
                      Name
                      <input name="name" defaultValue={sector.name} required />
                    </label>
                    <label>
                      Rule phrases
                      <input
                        name="keywords"
                        defaultValue={sector.keywords.join(", ")}
                      />
                    </label>
                    <label className="connected-check">
                      <input
                        type="checkbox"
                        name="archived"
                        defaultChecked={sector.status === "archived"}
                      />
                      Archive from future automatic assignments
                    </label>
                    <Button disabled={busy} type="submit">
                      Save sector
                    </Button>
                  </form>
                </details>
              )}
            </article>
          ))}
        </div>
        {owner && (
          <Button
            kind="secondary"
            disabled={busy}
            onClick={() =>
              void act(() => request("/sectors/backfill", { limit: 25 }))
            }
          >
            Classify next 25 unassigned or taxonomy-stale opportunities
          </Button>
        )}
      </section>
      <section className="connected-panel section-gap">
        <h2>Opportunity assignments</h2>
        <p>
          Person corrections take precedence over later automatic GETS checks.
          Assignment history retains taxonomy, classifier, notice revision and
          reason.
        </p>
        <label>
          Find an opportunity
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Title or RFx ID"
          />
        </label>
        <div className="sector-assignment-list">
          {rows.slice((page - 1) * 25, page * 25).map((row) => (
            <article className="sector-row" key={row.opportunity_id}>
              <div>
                <strong>{row.title}</strong> · RFx {row.notice_id}
                <p className="small">
                  {sectors.find((sector) => sector.id === row.sector_id)
                    ?.name || "Unknown"}{" "}
                  · {row.method} · taxonomy v{row.taxonomy_version}
                </p>
                <p className="small muted">
                  {row.reason} · {row.evidence_pointer || "No source pointer"}
                </p>
              </div>
              {owner && (
                <Button
                  kind="text"
                  onClick={() => {
                    setSelected(row.opportunity_id);
                    setChoice(row.sector_id || "");
                    setReason("");
                  }}
                >
                  Correct
                </Button>
              )}
              {selected === row.opportunity_id && owner && (
                <form
                  className="connected-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void act(async () => {
                      const result = await request(
                        `/opportunities/${row.opportunity_id}/sector`,
                        { sectorId: choice || null, reason },
                      );
                      setSelected("");
                      return result;
                    });
                  }}
                >
                  <label>
                    Groundwork primary sector
                    <select
                      value={choice}
                      onChange={(e) => setChoice(e.target.value)}
                    >
                      <option value="">Unknown</option>
                      {sectors
                        .filter((sector) => sector.status === "active")
                        .map((sector) => (
                          <option key={sector.id} value={sector.id}>
                            {sector.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    Reason / evidence
                    <textarea
                      required
                      minLength={10}
                      maxLength={1000}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                  </label>
                  <Button type="submit" disabled={busy}>
                    Save manual correction
                  </Button>
                </form>
              )}
            </article>
          ))}
        </div>
        {rows.length > 25 && (
          <div className="inline">
            <Button
              kind="secondary"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </Button>
            <span>
              Page {page} of {Math.ceil(rows.length / 25)}
            </span>
            <Button
              kind="secondary"
              disabled={page * 25 >= rows.length}
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
