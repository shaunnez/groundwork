import { useState, type FormEvent } from "react";
import { Badge, Button, Empty, I, Loading, Modal, Notice } from "../ui";
import { Heading } from "./Chrome";
import { PdfEvidence } from "./PdfEvidence";
import {
  SourceEditor,
  PublicResearch,
  supportedFiles,
} from "./SourceManagement";
import type { Source } from "./data";
import { SourceContent } from "./SourceContent";
import {
  activeRun,
  date,
  latestPursuit,
  provenance,
  request,
  uploadTenderFile,
  type Bootstrap,
  type Detail,
  type EvidenceSource,
  type Navigate,
  type SavedReport,
} from "./data";
export type Action = (
  fn: () => Promise<void>,
  message?: string,
) => Promise<void>;
const val = (f: FormData, k: string) => String(f.get(k) || "");
const purposeLabel: Record<string, string> = {
  notice: "Procurement notice",
  rfp: "Tender documents",
  addendum: "Addendum",
  context: "Public research",
  awards: "Award history",
  client: "Firm evidence",
};
const formatLabel: Record<string, string> = {
  "application/json": "Structured data",
  "application/pdf": "PDF",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "Word document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
    "Excel workbook",
  "text/plain": "Text document",
  "text/html": "Web page",
  "text/csv": "CSV document",
};
export function AddOpportunity({
  boot,
  busy,
  onClose,
  onSave,
}: {
  boot: Bootstrap;
  busy: boolean;
  onClose: () => void;
  onSave: (v: unknown) => void;
}) {
  return (
    <Modal title="Add an opportunity" onClose={onClose}>
      <p>
        Start with a notice you have permission to use. Source documents are
        added in the next step.
      </p>
      <form
        className="connected-form"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          onSave({
            title: val(f, "title"),
            buyer: val(f, "buyer"),
            noticeId: val(f, "reference"),
            category: val(f, "category") || "unspecified",
            cutoff: val(f, "cutoff"),
            clientId: val(f, "client") || null,
            noticeUrl: val(f, "url") || null,
            dateStatus: "not_published",
            provenance: val(f, "provenance"),
          });
        }}
      >
        <label>
          Opportunity title
          <input name="title" minLength={3} maxLength={300} required />
        </label>
        <div className="connected-fields">
          <label>
            Buyer / agency
            <input name="buyer" minLength={2} required />
          </label>
          <label>
            Notice reference
            <input name="reference" required />
          </label>
        </div>
        <label>
          Public notice URL (optional)
          <input name="url" type="url" placeholder="https://…" />
        </label>
        <label>
          Category or classification
          <input
            name="category"
            placeholder="Use the notice's category when known"
          />
        </label>
        <div className="connected-fields">
          <label>
            Assessment date
            <input
              name="cutoff"
              type="date"
              required
              defaultValue={new Date().toLocaleDateString("en-CA")}
            />
          </label>
          <label>
            Evidence origin
            <select name="provenance">
              <option value="public">Public procurement evidence</option>
              <option value="synthetic">Synthetic evaluation</option>
            </select>
          </label>
        </div>
        <label>
          Firm profile
          <select name="client">
            <option value="">Not supplied yet</option>
            {boot.clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.legal_name}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" disabled={busy}>
          Save and add evidence <I.ArrowRight size={16} />
        </Button>
      </form>
    </Modal>
  );
}
export function FirmView({
  boot,
  go,
  busy,
  onSave,
}: {
  boot: Bootstrap;
  go: Navigate;
  busy: boolean;
  onSave: (x: unknown) => void;
}) {
  const [adding, setAdding] = useState(!boot.clients.length);
  return (
    <>
      <Heading
        go={go}
        eyebrow="YOUR FIRM"
        title="Context that makes the assessment yours."
        description="Your supplied capabilities stay separate from procurement evidence. Missing answers remain unknown."
        actions={
          <Button
            kind="secondary"
            aria-expanded={adding}
            aria-controls="firm-profile-form"
            onClick={() => setAdding(!adding)}
          >
            {adding ? "Cancel new profile" : "Add firm profile"}
          </Button>
        }
      />
      {boot.clients.map((c) => (
        <section key={c.id} className="connected-panel section-gap">
          <h2>{c.legal_name}</h2>
          <p className="small muted">
            Supplied by your team · Effective {date(c.context.effectiveDate)}
          </p>
          <h3>Capabilities</h3>
          <p>{c.context.capabilities || "Not supplied"}</p>
          <h3>Certifications</h3>
          <p>{c.context.certifications || "Not supplied"}</p>
          <h3>Current contracts</h3>
          <p>{c.context.currentContracts || "Not supplied"}</p>
        </section>
      ))}
      {adding && (
        <section className="connected-panel" id="firm-profile-form">
          <h2>Add a firm profile</h2>
          <form
            className="connected-form"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              onSave({
                legalName: val(f, "name"),
                capabilities: val(f, "capabilities"),
                certifications: val(f, "certifications"),
                currentContracts: val(f, "contracts"),
                effectiveDate: val(f, "date"),
              });
            }}
          >
            <label>
              Legal entity name
              <input name="name" minLength={2} required />
            </label>
            <label>
              Services and capabilities
              <textarea name="capabilities" rows={4} />
            </label>
            <label>
              Certifications and panel memberships
              <textarea name="certifications" rows={3} />
            </label>
            <label>
              Current contracts and client relationships
              <textarea name="contracts" rows={3} />
            </label>
            <label>
              Effective date
              <input
                type="date"
                name="date"
                required
                defaultValue={new Date().toLocaleDateString("en-CA")}
              />
            </label>
            <p className="small muted">
              Select this profile when adding an opportunity. Saved reports
              retain the context used at assessment time.
            </p>
            <Button type="submit" disabled={busy}>
              Save firm profile
            </Button>
          </form>
        </section>
      )}
    </>
  );
}
export function SourceView({
  owner,
  researchEnabled,
  onRefresh,
  detail,
  go,
  onSource,
  onEvidence,
  action,
  busy,
}: {
  owner: boolean;
  researchEnabled: boolean;
  onRefresh: () => Promise<void>;
  detail: Detail;
  go: Navigate;
  onSource: (id: string) => void;
  onEvidence: (id: string, quote?: string) => void;
  action: Action;
  busy: boolean;
}) {
  const [editing, setEditing] = useState<{
    source: Source;
    mode: "edit" | "replace" | "archive" | "restore";
  } | null>(null);
  const [search, setSearch] = useState<{
    query?: string;
    state: string;
    scope: string;
    sources: {
      sourceId: string;
      state: string;
      hits: { id: string; text: string; location: string }[];
    }[];
  } | null>(null);
  async function sourcesChanged() {
    setSearch(null);
    await onRefresh();
  }
  return (
    <>
      <Heading
        go={go}
        eyebrow="EVIDENCE LIBRARY"
        back={{ label: "Watchlist", page: "watchlist" }}
        title="Every conclusion starts here."
        description={detail.opportunity.title}
        actions={
          owner && (
            <Button onClick={() => go("upload", detail.opportunity.id)}>
              <I.Upload size={16} />
              Add documents
            </Button>
          )
        }
      />
      <div className="table-scroll">
        <table className="data-table connected-table source-table">
          <caption className="sr-only">
            Sources admitted to this opportunity
          </caption>
          <thead>
            <tr>
              <th scope="col">Source</th>
              <th scope="col">Purpose</th>
              <th scope="col">Coverage</th>
              <th scope="col">Evidence origin</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {detail.sources.map((s) => (
              <tr key={s.id}>
                <td data-label="Source">
                  <span className="source-name">
                    <I.File size={16} />
                    <strong>{s.name}</strong>
                  </span>
                  <small className="muted">
                    {formatLabel[s.media_type] || s.media_type}
                  </small>
                </td>
                <td data-label="Purpose">
                  {purposeLabel[s.purpose] || s.purpose}
                </td>
                <td data-label="Coverage">
                  <Badge tone={s.state === "read" ? "success" : "warning"}>
                    {s.coverage.read} / {s.coverage.total ?? "?"}{" "}
                    {s.coverage.unit}s read
                  </Badge>
                  {s.coverage.failures.map((f, i) => (
                    <p className="small" key={i}>
                      {f}
                    </p>
                  ))}
                </td>
                <td data-label="Evidence origin">
                  {s.provenance === "synthetic"
                    ? "Synthetic evaluation"
                    : "Public evidence"}
                </td>
                <td className="table-action" data-label="Actions">
                  <Button
                    kind="text"
                    aria-label={`Inspect ${s.name}`}
                    onClick={() => onSource(s.id)}
                  >
                    Inspect <I.ArrowRight size={16} />
                  </Button>
                  {owner && (
                    <select
                      className="source-manage"
                      aria-label={`Manage ${s.name}`}
                      value=""
                      disabled={busy}
                      onChange={(event) => {
                        const mode = event.target.value as
                          "edit" | "replace" | "archive";
                        if (mode) setEditing({ source: s, mode });
                      }}
                    >
                      <option value="">Manage…</option>
                      <option value="edit">Edit details</option>
                      <option value="replace">Replace document</option>
                      <option value="archive">Remove from pack</option>
                    </select>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!detail.sources.length && (
        <Empty
          title={
            detail.sourceHistory?.length
              ? "No active sources"
              : "No evidence added yet"
          }
          description={
            detail.sourceHistory?.length
              ? "Restore an archived source or add new evidence for the next assessment."
              : "Add the notice, then supporting documents and public research."
          }
        />
      )}
      {!!detail.sourceHistory?.length && (
        <details className="source-history section-gap">
          <summary>
            Archived sources and earlier versions ({detail.sourceHistory.length}
            )
          </summary>
          <ul>
            {detail.sourceHistory.map((s) => (
              <li key={s.id}>
                <div>
                  <strong>{s.name}</strong>
                  <p className="small muted">
                    {s.status === "superseded"
                      ? "Replaced by a newer version"
                      : "Archived · excluded from future assessments"}{" "}
                    · {s.reason}
                  </p>
                </div>
                <div className="source-actions">
                  <Button kind="text" onClick={() => onSource(s.id)}>
                    Inspect original
                  </Button>
                  {owner && s.status === "archived" && (
                    <Button
                      kind="secondary"
                      disabled={busy}
                      onClick={() => setEditing({ source: s, mode: "restore" })}
                    >
                      Restore
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}
      {owner && (
        <PublicResearch
          detail={detail}
          busy={busy}
          action={action}
          onRefresh={sourcesChanged}
          enabled={researchEnabled}
        />
      )}
      {editing && (
        <SourceEditor
          source={editing.source}
          mode={editing.mode}
          opportunityId={detail.opportunity.id}
          action={action}
          busy={busy}
          onRefresh={sourcesChanged}
          onClose={() => setEditing(null)}
        />
      )}
      <section className="connected-panel section-gap">
        <h2>Find a passage</h2>
        <form
          className="connected-form"
          onSubmit={(e) => {
            e.preventDefault();
            const q = val(new FormData(e.currentTarget), "query");
            void action(async () => {
              const result = await request<NonNullable<typeof search>>(
                "/opportunities/" + detail.opportunity.id + "/search",
                { query: q },
              );
              setSearch({ ...result, query: q });
            });
          }}
        >
          <label>
            Search this evidence pack
            <input
              name="query"
              required
              placeholder="A phrase, requirement or supplier name"
            />
          </label>
          <Button kind="secondary" disabled={busy} type="submit">
            Search evidence
          </Button>
        </form>
        {search && (
          <div role="status" className="section-gap">
            <h3>
              {search.state === "found"
                ? "Matching passages"
                : search.state === "not_found"
                  ? "No exact matches in the searched pack"
                  : "Search coverage is incomplete"}
            </h3>
            <p className="small muted">
              {search.scope}. An incomplete search cannot establish absence.
            </p>
            {search.sources.map((s, i) => (
              <div key={i}>
                <strong>
                  {detail.sources.find((source) => source.id === s.sourceId)
                    ?.name || "Saved source"}
                </strong>
                <p className="small muted">
                  {s.state === "found"
                    ? "Matching passages found"
                    : s.state === "not_found"
                      ? "No exact match · complete source search"
                      : "Source search incomplete"}
                </p>
                {s.hits.map((h) => (
                  <article className="connected-search-hit" key={h.id}>
                    <p>{h.text.slice(0, 350)}</p>
                    <button
                      className="citation"
                      onClick={() => onEvidence(h.id, search.query)}
                    >
                      Open {h.location}
                    </button>
                  </article>
                ))}
              </div>
            ))}
          </div>
        )}
      </section>
      <Button kind="text" onClick={() => go("pursuit", detail.opportunity.id)}>
        Return to pursuit
      </Button>
    </>
  );
}
export function SourceDialog({
  quote,
  source,
  unitId,
  onClose,
}: {
  quote?: string;
  source: EvidenceSource | null;
  unitId?: string;
  onClose: () => void;
}) {
  const [selectedId, setSelectedId] = useState(unitId);
  const selected =
    source?.units.find((u) => u.id === selectedId) || source?.units[0];
  return (
    <Modal title={source?.name || "Opening source evidence"} onClose={onClose}>
      {!source ? (
        <Loading label="Opening frozen source" rows={2} />
      ) : (
        <div className="evidence connected-evidence">
          <p className="source-meta">
            {source.provenance === "synthetic"
              ? "Synthetic evaluation"
              : "Public evidence"}{" "}
            · {source.coverage.read} / {source.coverage.total ?? "?"}{" "}
            {source.coverage.unit}s read
          </p>
          <div className="viewer-controls">
            <label>
              Source section
              <select
                aria-label="Source section"
                value={selected?.id || ""}
                onChange={(e) => {
                  setSelectedId(e.target.value);
                }}
              >
                {source.units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.location}
                  </option>
                ))}
              </select>
            </label>
            <a
              className="button secondary"
              href={"/api/sources/" + source.id + "/download"}
              download
            >
              Download original
            </a>
          </div>
          {source.media_type === "application/pdf" && (
            <PdfEvidence
              key={selected?.id || source.id}
              sourceId={source.id}
              unit={selected}
              quote={selected?.id === unitId ? quote : undefined}
              total={source.coverage.total}
            />
          )}
          {selected ? (
            <div className="source-paper">
              <h3>
                {source.media_type === "application/pdf"
                  ? "Extracted text · "
                  : ""}
                {selected.location}
              </h3>
              <SourceContent
                key={selected.id}
                text={selected.text}
                mediaType={source.media_type}
                quote={selected.id === unitId ? quote : undefined}
              />
            </div>
          ) : (
            <Notice title="This source could not be read">
              {source.coverage.failures.join(" ")}
            </Notice>
          )}
          <p className="small muted">
            Preserved original · Read-only source evidence
          </p>
        </div>
      )}
    </Modal>
  );
}
export function UploadView({
  detail,
  go,
  busy,
  action,
  onSaved,
}: {
  detail: Detail;
  go: Navigate;
  busy: boolean;
  action: Action;
  onSaved: () => Promise<void>;
}) {
  const [mode, setMode] = useState("file"),
    [done, setDone] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await action(async () => {
      const base = {
        purpose: val(f, "purpose"),
        publishedAt: val(f, "publishedAt") || null,
        provenance: detail.opportunity.metadata.provenance,
        rightsConfirmed: true,
        required: true,
      };
      if (mode === "file") {
        const data = new FormData();
        for (const [k, v] of Object.entries(base))
          data.append(k, v === null ? "" : String(v));
        data.append("file", f.get("file") as File);
        await request(
          "/opportunities/" + detail.opportunity.id + "/upload",
          data,
        );
      } else
        await request("/opportunities/" + detail.opportunity.id + "/sources", {
          ...base,
          name: val(f, "name"),
          mediaType: "text/plain",
          ...(mode === "url"
            ? { url: val(f, "url") }
            : { text: val(f, "text") }),
        });
      await onSaved();
      setDone(true);
    }, "Source saved. Existing reports are preserved.");
  }
  return (
    <>
      <Heading
        go={go}
        eyebrow="RFP & SUPPORTING EVIDENCE"
        title="Add the documents. Test the assumptions."
        description={detail.opportunity.title}
      />
      {/^\d+$/.test(detail.opportunity.notice_id) &&
        detail.opportunity.metadata.noticeUrl?.includes("gets.govt.nz") && (
          <TenderPackPanel
            detail={detail}
            busy={busy}
            action={action}
            onSaved={onSaved}
          />
        )}
      <div className="two-col connected-form-layout upload-form-layout">
        <section className="connected-panel">
          {done && (
            <Notice title="Source saved" tone="success">
              Inspect its reading coverage before requesting reassessment.{" "}
              <Button
                kind="text"
                onClick={() => go("sources", detail.opportunity.id)}
              >
                Inspect source library
              </Button>
              <Button
                kind="text"
                onClick={() => go("request", detail.opportunity.id)}
              >
                Continue to reassessment
              </Button>
            </Notice>
          )}
          <div className="segmented">
            {[
              ["file", "Upload a file"],
              ["text", "Paste source text"],
              ["url", "Public URL"],
            ].map(([id, label]) => (
              <button
                key={id}
                className={mode === id ? "active" : ""}
                aria-pressed={mode === id}
                onClick={() => {
                  setMode(id);
                  setDone(false);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <form
            key={mode}
            className="connected-form section-gap"
            onSubmit={(e) => void submit(e)}
          >
            {mode === "file" ? (
              <label className="connected-dropzone">
                <I.Upload size={32} />
                <strong>Choose your source document</strong>
                <span>PDF, Word, Excel, HTML or text · Up to 20 MB</span>
                <input
                  type="file"
                  name="file"
                  required
                  accept={supportedFiles}
                  onChange={() => setDone(false)}
                />
              </label>
            ) : (
              <>
                <label>
                  Source name
                  <input name="name" required />
                </label>
                {mode === "url" ? (
                  <label>
                    Permitted public URL
                    <input
                      name="url"
                      type="url"
                      required
                      placeholder="https://…"
                    />
                  </label>
                ) : (
                  <label>
                    Source text
                    <textarea name="text" rows={9} required />
                  </label>
                )}
              </>
            )}
            <div className="connected-fields">
              <label>
                Document purpose
                <select
                  name="purpose"
                  defaultValue={detail.sources.length ? "rfp" : "notice"}
                >
                  {[
                    ["notice", "Procurement notice"],
                    ["rfp", "RFP / tender documents"],
                    ["addendum", "Addendum or clarification"],
                    ["context", "Public research"],
                    ["awards", "Award history"],
                    ["client", "Firm evidence"],
                  ].map(([id, label]) => (
                    <option value={id} key={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Source publication date
                <input name="publishedAt" type="date" />
              </label>
            </div>
            <label className="connected-check">
              <input type="checkbox" required />I have permission to use this
              source for this assessment.
            </label>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving source…" : "Save evidence"}
            </Button>
          </form>
        </section>
        <aside className="pursuit-rail">
          <span className="eyebrow">WHAT HAPPENS NEXT</span>
          <h2>Evidence first. A new version next.</h2>
          <p>
            We retain the original, check what can be read, and keep gaps
            visible. Adding a document does not overwrite an earlier assessment.
          </p>
          <p>
            Scanned PDFs use local OCR. Word paragraphs and Excel cells retain
            their locations. Unreadable pages, embedded content and missing
            formula values remain visible and block a complete review.
          </p>
          <p className="small muted">
            {provenance(detail.opportunity)}. Protected GETS/RealMe pages
            require permitted document supply.
          </p>
          <Button
            kind="text"
            onClick={() => go("sources", detail.opportunity.id)}
          >
            View saved evidence
          </Button>
        </aside>
      </div>
    </>
  );
}

function TenderPackPanel({
  detail,
  busy,
  action,
  onSaved,
}: {
  detail: Detail;
  busy: boolean;
  action: Action;
  onSaved: () => Promise<void>;
}) {
  const [manifest, setManifest] = useState("");
  const pack = detail.tenderPacks?.[0];
  return (
    <section
      className="connected-panel section-gap"
      aria-labelledby="tender-pack-title"
    >
      <span className="eyebrow">SELECTED GETS NOTICE</span>
      <h2 id="tender-pack-title">Import tender documents</h2>
      <p>
        Declare the subscribed attachment inventory, then supply each original
        from an authorised owner transfer. GETS/RealMe sign-in stays in your
        browser. A saved notice and its revision are required.
      </p>
      {!pack ? (
        <form
          className="connected-form"
          onSubmit={(e) => {
            e.preventDefault();
            void action(async () => {
              const parsed = JSON.parse(manifest) as unknown;
              await request(
                `/opportunities/${detail.opportunity.id}/tender-packs`,
                parsed,
              );
              await onSaved();
            }, "Tender inventory declared. Originals are still required.");
          }}
        >
          <label>
            GETS attachment inventory JSON
            <textarea
              required
              rows={6}
              value={manifest}
              onChange={(e) => setManifest(e.target.value)}
              placeholder='{"rfxId":"34995788","observedAt":"2026-09-23T00:00:00+12:00","files":[{"fileId":"...","name":"...pdf","bytes":123,"sha256":"...","kind":"attachment"}]}'
            />
          </label>
          <p className="small muted">
            Each file needs its GETS identifier, displayed name, byte size,
            SHA-256 checksum and attachment or addendum type. The inventory is
            frozen when saved.
          </p>
          <Button type="submit" disabled={busy}>
            Declare inventory
          </Button>
        </form>
      ) : (
        <>
          <p>
            <strong>
              {pack.counts.received} of {pack.counts.expected} originals
              admitted; {pack.counts.readable} readable.
            </strong>{" "}
            {pack.complete
              ? "Pack reconciled for this snapshot."
              : "RFP coverage remains incomplete."}
          </p>
          <p className="small muted">
            RFx {pack.rfxId} · GETS inventory observed {date(pack.observedAt)} ·
            notice revision {pack.noticeRevisionId}
          </p>
          <div className="tender-pack-list">
            {pack.files.map((entry) => (
              <TenderFileRow
                key={entry.fileId}
                packId={pack.id}
                entry={entry}
                busy={busy}
                action={action}
                onSaved={onSaved}
              />
            ))}
          </div>
          <p className="small muted">
            A changed GETS inventory requires a new declared pack. Older
            originals and report citations remain available.
          </p>
        </>
      )}
    </section>
  );
}

function TenderFileRow({
  packId,
  entry,
  busy,
  action,
  onSaved,
}: {
  packId: string;
  entry: NonNullable<Detail["tenderPacks"]>[number]["files"][number];
  busy: boolean;
  action: Action;
  onSaved: () => Promise<void>;
}) {
  const [selected, setSelected] = useState<File | null>(null);
  return (
    <article className="tender-file-row">
      <div>
        <strong>{entry.name}</strong>
        <p className="small muted">
          GETS file {entry.fileId} · {entry.kind} ·{" "}
          {entry.bytes.toLocaleString()} bytes · SHA-256 {entry.sha256}
        </p>
        <p className="small">
          {entry.state} · {entry.reader}
          {entry.coverage
            ? ` · ${entry.coverage.read}/${entry.coverage.total ?? "?"} ${entry.coverage.unit}s read`
            : ""}
        </p>
        {entry.problem && (
          <p className="small" role="status">
            {entry.problem}
          </p>
        )}
        {entry.technicalReviewRequired && (
          <p className="small" role="status">
            {entry.technicalReview
              ? `Drawing review recorded ${date(entry.technicalReview.reviewedAt)}: ${entry.technicalReview.note}`
              : "Drawing interpretation has not been reviewed; file reconciliation depends on reader coverage, not this optional review."}
          </p>
        )}
        {entry.sourceId && (
          <a href={`/api/sources/${entry.sourceId}/download`}>
            Download preserved original
          </a>
        )}
        {entry.sourceId &&
          entry.technicalReviewRequired &&
          !entry.technicalReview &&
          entry.state === "read" && (
            <details>
              <summary>Record drawing review</summary>
              <form
                className="connected-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const note = String(
                    new FormData(e.currentTarget).get("note") || "",
                  );
                  void action(async () => {
                    await request(
                      `/tender-packs/${packId}/files/${entry.fileId}/drawing-review`,
                      { note },
                    );
                    await onSaved();
                  }, "Drawing review recorded.");
                }}
              >
                <label>
                  What pages and technical content were checked?
                  <textarea
                    name="note"
                    minLength={30}
                    maxLength={2000}
                    required
                  />
                </label>
                <Button type="submit" disabled={busy}>
                  Record review
                </Button>
              </form>
            </details>
          )}
      </div>
      {entry.status === "current" && !entry.sourceId && (
        <div className="connected-form">
          <label>
            Supply original
            <input
              type="file"
              accept=".pdf,.docx,.xlsx"
              onChange={(e) => setSelected(e.target.files?.[0] ?? null)}
            />
          </label>
          <Button
            type="button"
            disabled={busy || !selected}
            onClick={() => {
              if (!selected) return;
              void action(async () => {
                if (selected.name !== entry.name)
                  throw new Error(`Choose ${entry.name}`);
                if (selected.size !== entry.bytes)
                  throw new Error(
                    `Expected ${entry.bytes} bytes for ${entry.name}`,
                  );
                await uploadTenderFile(packId, entry.fileId, selected);
                await onSaved();
                setSelected(null);
              }, `${entry.name} admitted with its reader outcome.`);
            }}
          >
            Verify and admit
          </Button>
        </div>
      )}
    </article>
  );
}
export function RequestView({
  detail,
  go,
  busy,
  action,
  onRefresh,
}: {
  detail: Detail;
  go: Navigate;
  busy: boolean;
  action: Action;
  onRefresh: () => Promise<void>;
}) {
  const latest = latestPursuit(detail),
    run = activeRun(detail);
  const [cutoff, setCutoff] = useState(
      latest?.payload.cutoff || detail.opportunity.cutoff,
    ),
    [excluded, setExcluded] = useState<string[]>([]),
    [narrowPack, setNarrowPack] = useState(false);
  const pack = detail.tenderPacks?.[0];
  return (
    <>
      <Heading
        go={go}
        eyebrow="REQUEST ANALYSIS"
        title={
          latest
            ? "Reassess with the evidence in front of you."
            : "Build your first pursuit package."
        }
        description={detail.opportunity.title}
      />
      <div className="two-col connected-form-layout">
        <section className="connected-panel">
          <h2>Your assessment scope</h2>
          <form
            className="connected-form"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void action(async () => {
                await request(
                  "/opportunities/" + detail.opportunity.id + "/runs",
                  {
                    cutoff,
                    parentReportId:
                      latest && latest.payload.cutoff <= cutoff
                        ? latest.id
                        : null,
                    excludedSourceIds: excluded,
                    scopeNote: val(f, "scopeNote"),
                    allowIncompleteTenderPack: narrowPack,
                  },
                );
                await onRefresh();
                go("processing", detail.opportunity.id);
              }, "Assessment request saved.");
            }}
          >
            <label>
              Assess using information available on
              <input
                type="date"
                required
                value={cutoff}
                onChange={(e) => setCutoff(e.target.value)}
              />
            </label>
            {latest && cutoff < latest.payload.cutoff && (
              <Notice title="Independent historical assessment" tone="info">
                Later reports will not be used. Exclude later-dated source
                documents below.
              </Notice>
            )}
            <h3>{detail.sources.length} saved sources</h3>
            {pack && !pack.complete && (
              <Notice title="Tender pack is incomplete" tone="warning">
                {pack.counts.received} of {pack.counts.expected} originals
                admitted; {pack.counts.readable} readable. Complete the named
                files before an exhaustive RFP reassessment. A narrower run must
                state its limits.
                <Button
                  kind="text"
                  type="button"
                  onClick={() => go("upload", detail.opportunity.id)}
                >
                  Import tender documents
                </Button>
              </Notice>
            )}
            {detail.sources.map((s) => (
              <div className="connected-source-row" key={s.id}>
                <I.File size={20} />
                <div>
                  <strong>{s.name}</strong>
                  <p className="small muted">
                    {s.purpose} · {s.coverage.read}/{s.coverage.total ?? "?"}{" "}
                    {s.coverage.unit}s read
                  </p>
                </div>
                <Badge tone={s.state === "read" ? "success" : "warning"}>
                  {s.state === "read" ? "Readable" : "Needs attention"}
                </Badge>
              </div>
            ))}
            <details open={pack && !pack.complete ? true : undefined}>
              <summary>Define a narrower evidence scope</summary>
              <p className="small muted">
                Exclusions remain named on the assessment. This does not certify
                that the full pack was read.
              </p>
              {detail.sources.map((s) => (
                <label key={s.id} className="connected-check">
                  <input
                    type="checkbox"
                    checked={excluded.includes(s.id)}
                    onChange={(e) =>
                      setExcluded((x) =>
                        e.target.checked
                          ? [...x, s.id]
                          : x.filter((id) => id !== s.id),
                      )
                    }
                  />
                  Exclude {s.name}
                </label>
              ))}
              {pack && !pack.complete && (
                <label className="connected-check">
                  <input
                    type="checkbox"
                    checked={narrowPack}
                    onChange={(e) => setNarrowPack(e.target.checked)}
                  />
                  I am requesting a limited assessment; missing or unread tender
                  files remain explicit gaps.
                </label>
              )}
              <label>
                Scope and reason for exclusions
                <textarea
                  name="scopeNote"
                  required={excluded.length > 0 || narrowPack}
                  minLength={narrowPack ? 30 : undefined}
                />
              </label>
            </details>
            <p className="small muted">
              Generation uses the configured Claude subscription. Existing
              versions remain readable while the assessment runs.
            </p>
            <Button
              disabled={
                busy ||
                !!run ||
                !detail.sources.length ||
                (!!pack && !pack.complete && !narrowPack)
              }
              type="submit"
            >
              {run
                ? "Assessment already in progress"
                : latest
                  ? "Start reassessment"
                  : "Generate pursuit package"}
            </Button>
            {run && (
              <Button
                kind="text"
                onClick={() => go("processing", detail.opportunity.id)}
              >
                View progress
              </Button>
            )}
          </form>
        </section>
        <aside className="pursuit-rail">
          <h2>What you’ll receive</h2>
          <p>
            A cited pursuit package with a clear recommendation, competitive
            context, scenarios, risks and gaps.
          </p>
          <p>
            RFPs and addenda are reviewed across every admitted section. Analyst
            review remains separate from generation.
          </p>
          <Button
            kind="text"
            onClick={() => go("upload", detail.opportunity.id)}
          >
            Add another document
          </Button>
        </aside>
      </div>
    </>
  );
}
export function ProgressView({
  detail,
  go,
  busy,
  action,
  onRefresh,
}: {
  detail: Detail;
  go: Navigate;
  busy: boolean;
  action: Action;
  onRefresh: () => Promise<void>;
}) {
  const run = detail.runs[0],
    latest = latestPursuit(detail);
  const stages: Record<string, string> = {
    admit: "Checking the evidence scope",
    intelligence: "Building competitive context",
    assess: "Writing the assessment",
    verify: "Checking claims and citations",
    saved: "Report saved",
  };
  const progress = run?.progress;
  const stopped =
    run &&
    ["failed", "cancelled", "budget-blocked", "succeeded"].includes(run.state);
  const elapsedSeconds = run
    ? Math.max(
        0,
        Math.floor(
          (new Date(
            stopped ? (run.updated_at ?? run.created_at) : Date.now(),
          ).getTime() -
            new Date(run.created_at).getTime()) /
            1000,
        ),
      )
    : 0;
  const elapsedLabel =
    elapsedSeconds < 60
      ? `${elapsedSeconds} seconds`
      : `${Math.floor(elapsedSeconds / 60)} minute${Math.floor(elapsedSeconds / 60) === 1 ? "" : "s"}`;
  const stageLabel = (name: string) =>
    ({
      "entity-observations": "Finding named market participants",
      "verify-entities": "Checking market participant evidence",
      "correct-assessment": "Correcting unsupported claims",
      "verify-correction": "Checking corrected claims",
    })[name] ??
    stages[name] ??
    name.replaceAll("-", " ");
  return (
    <>
      <Heading
        go={go}
        eyebrow="ANALYSIS PROGRESS"
        title={
          run?.state === "succeeded"
            ? "Your assessment is ready."
            : run?.state === "failed"
              ? "This assessment stopped."
              : run?.state === "cancelled"
                ? "This assessment was cancelled."
                : run?.state === "budget-blocked"
                  ? "This assessment is blocked."
                  : run?.state === "queued"
                    ? "Your assessment is waiting to start."
                    : "Your evidence is being reviewed."
        }
        description={detail.opportunity.title}
      />
      {!run ? (
        <Empty
          title="No assessment requested yet"
          description="Confirm your source pack and start the first assessment."
          action={
            <Button onClick={() => go("request", detail.opportunity.id)}>
              Request assessment
            </Button>
          }
        />
      ) : (
        <section className="connected-panel">
          <Badge tone={run.state === "failed" ? "warning" : "info"}>
            {run.state === "succeeded"
              ? "Saved for review"
              : run.state === "failed"
                ? "Stopped"
                : run.state === "budget-blocked"
                  ? "Blocked by usage limit"
                  : run.state}
          </Badge>
          <h2>
            {run.state === "queued"
              ? "Waiting for an analysis worker"
              : run.state === "failed" && progress?.readinessIssues.length
                ? "Stopped before model analysis"
                : stages[run.stage] || "Reviewing source requirements"}
          </h2>
          <p>
            Requested {new Date(run.created_at).toLocaleString("en-NZ")} ·
            {run.state === "queued"
              ? ` waiting for ${elapsedLabel}`
              : run.state === "running"
                ? ` elapsed ${elapsedLabel}`
                : ` ended after ${elapsedLabel}`}
          </p>
          {run.started_at && (
            <p className="small muted">
              Worker started {new Date(run.started_at).toLocaleString("en-NZ")}
            </p>
          )}
          {run.state === "queued" && progress?.workerAttempts === 0 && (
            <Notice title="Not started yet" tone="warning">
              No worker has claimed this request. No evidence analysis or model
              call has begun.
            </Notice>
          )}
          {progress &&
            !progress.modelEnabled &&
            ["queued", "running"].includes(run.state) && (
              <Notice title="Model work is disabled here" tone="warning">
                This workspace has not enabled Claude subscription report
                generation. The run cannot generate a report until that setting
                is resolved.
              </Notice>
            )}
          {!!progress?.readinessIssues.length && (
            <Notice title="Evidence scope blocks this run" tone="warning">
              <ul>
                {progress.readinessIssues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
              The saved source manifest cannot be changed in place. Start a new
              request with a narrower, fully readable scope.
            </Notice>
          )}
          {progress && (
            <div className="section-gap">
              <h3>Recorded progress</h3>
              {progress.stages.length ? (
                <ol>
                  {progress.stages.map((stage) => (
                    <li key={stage.name}>
                      {stageLabel(stage.name)} · {stage.state}
                      {stage.finished_at
                        ? ` · finished ${new Date(stage.finished_at).toLocaleTimeString("en-NZ")}`
                        : ""}
                    </li>
                  ))}
                </ol>
              ) : (
                <p>
                  {run.state === "failed" && run.stage === "admit"
                    ? "The worker stopped while checking the evidence scope, before model analysis."
                    : "No processing stage has started."}
                </p>
              )}
              <p className="small muted">
                {progress.modelCalls} model call
                {progress.modelCalls === 1 ? "" : "s"} recorded · US$
                {progress.apiEquivalentUsd.toFixed(2)} API-equivalent usage
                estimate. Actual subscription billing is not reported here.
              </p>
              {["queued", "running"].includes(run.state) && (
                <p className="small muted">
                  No reliable completion time is available for this source
                  scope.
                </p>
              )}
            </div>
          )}
          {["running", "queued"].includes(run.state) && (
            <>
              {run.state === "running" && (
                <Loading
                  label={stages[run.stage] || "Reviewing evidence"}
                  rows={3}
                />
              )}
              <Button
                disabled={busy}
                kind="secondary"
                onClick={() =>
                  void action(async () => {
                    await request("/runs/" + run.id + "/cancel", {});
                    await onRefresh();
                  }, "Assessment cancelled. Saved reports are unchanged.")
                }
              >
                Cancel assessment
              </Button>
            </>
          )}
          {run.error &&
            !(
              progress?.readinessIssues.length &&
              progress.readinessIssues.every((issue) =>
                run.error?.includes(issue),
              )
            ) && (
              <Notice title="This assessment needs attention" tone="error">
                {run.error}
              </Notice>
            )}
          {["failed", "cancelled", "budget-blocked"].includes(run.state) && (
            <div className="inline">
              {progress?.resumable && !progress.readinessIssues.length && (
                <Button
                  disabled={busy}
                  onClick={() =>
                    void action(async () => {
                      await request("/runs/" + run.id + "/resume", {});
                      await onRefresh();
                    }, "Resume requested.")
                  }
                >
                  Resume safely
                </Button>
              )}
              <Button
                kind="secondary"
                onClick={() => go("sources", detail.opportunity.id)}
              >
                Inspect evidence
              </Button>
            </div>
          )}
          {latest && (
            <Button
              kind="secondary"
              onClick={() => go("report", detail.opportunity.id, latest.id)}
            >
              {run.state === "succeeded"
                ? "Read the saved assessment"
                : "Read the previous assessment"}
              <I.ArrowRight size={16} />
            </Button>
          )}
          <p className="small muted section-gap">
            Completed work is retained. An uncertain provider call will not be
            repeated automatically.
          </p>
        </section>
      )}
    </>
  );
}
export function RequirementsView({
  report,
  go,
  detail,
  onEvidence,
}: {
  report: SavedReport | null;
  go: Navigate;
  detail: Detail;
  onEvidence: (id: string, quote?: string) => void;
}) {
  const r = report?.payload.requirements;
  const rows =
    r?.judgments?.flatMap((j) =>
      j.requirements.map((v) => ({
        ...v,
        unitId: j.candidateId.replace(/^candidate-/, ""),
      })),
    ) || [];
  return (
    <>
      <Heading
        go={go}
        title="Requirements, in full."
        eyebrow="REQUIREMENTS"
        description="Every identified condition, its source and the limits of the review."
        actions={
          <Button
            kind="secondary"
            onClick={() => go("pursuit", detail.opportunity.id)}
          >
            Back to assessment
          </Button>
        }
      />
      {r?.status !== "complete" ? (
        <Empty
          title="Tender requirements have not been fully assessed"
          description="Add the RFP and request reassessment. An empty inventory does not establish eligibility."
          action={
            <Button onClick={() => go("upload", detail.opportunity.id)}>
              Add tender documents
            </Button>
          }
        />
      ) : (
        <>
          <Notice
            title={`${r.candidatesJudged} of ${r.candidatesProduced} source sections reviewed`}
            tone="info"
          >
            Every admitted section was judged. This does not prove perfect
            semantic recall or your firm’s compliance.
          </Notice>
          {rows.length ? (
            rows.map((v, i) => (
              <article className="requirement-row" key={i}>
                <span className="row-number">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <Badge tone={v.mandatory ? "warning" : "neutral"}>
                    {v.mandatory ? "Mandatory" : "Requirement"}
                  </Badge>
                  <h2>{v.text}</h2>
                  <p>{v.rationale}</p>
                  {v.quote !== v.text && <blockquote>{v.quote}</blockquote>}
                  <button
                    className="citation"
                    onClick={() => onEvidence(v.unitId, v.quote)}
                  >
                    Inspect exact source clause
                  </button>
                </div>
                <div className="row-end">
                  <Badge>Firm compliance unverified</Badge>
                </div>
              </article>
            ))
          ) : (
            <p>
              No requirements identified in the reviewed sections. Inspect the
              source scope before interpreting this result.
            </p>
          )}
        </>
      )}
    </>
  );
}
