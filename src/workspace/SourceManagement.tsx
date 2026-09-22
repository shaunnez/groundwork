import { useState } from "react";
import { Button, Modal, Notice } from "../ui";
import { request, type Source, type Detail } from "./data";
import type { Action } from "./Workflows";
export const sourcePurposes = {
  notice: "Procurement notice",
  rfp: "Tender documents",
  addendum: "Addendum",
  context: "Public research",
  awards: "Award history",
  client: "Firm evidence",
};
export const supportedFiles = ".pdf,.docx,.xlsx,.txt,.html,.json,.csv";
export function SourceEditor({
  source,
  mode,
  opportunityId,
  busy,
  action,
  onRefresh,
  onClose,
}: {
  source: Source;
  mode: "edit" | "replace" | "archive" | "restore";
  opportunityId: string;
  busy: boolean;
  action: Action;
  onRefresh: () => Promise<void>;
  onClose: () => void;
}) {
  const [error, setError] = useState("");
  const title = {
    edit: "Edit source details",
    replace: "Replace document",
    archive: "Remove from this pack",
    restore: "Restore source",
  }[mode];
  return (
    <Modal title={title} onClose={onClose}>
      <p>
        <strong>{source.name}</strong>
      </p>
      <p>
        {mode === "archive"
          ? "This source will be archived and excluded from future assessments. Existing reports and their citations retain the original. You can restore it later."
          : mode === "restore"
            ? "Include this source in future assessments again. Existing reports will remain unchanged."
            : "A new version will be saved. Existing reports retain the source details and evidence they originally used."}
      </p>
      {error && (
        <Notice title="Could not save source" tone="warning">
          {error}
        </Notice>
      )}
      <form
        className="connected-form"
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          setError("");
          void action(async () => {
            try {
              const reason = String(form.get("reason"));
              if (mode === "archive" || mode === "restore")
                await request(`/sources/${source.id}/archive`, {
                  archived: mode === "archive",
                  reason,
                });
              else if (mode === "replace") {
                const data = new FormData();
                for (const [key, value] of Object.entries({
                  purpose: source.purpose,
                  required: source.required,
                  publishedAt: source.published_at ?? "",
                  provenance: source.provenance,
                  rightsConfirmed: true,
                  replacesId: source.id,
                  reason,
                }))
                  data.append(key, String(value));
                data.append("file", form.get("file") as File);
                await request(`/opportunities/${opportunityId}/upload`, data);
              } else
                await request(`/sources/${source.id}/edit`, {
                  name: String(form.get("name")),
                  purpose: String(form.get("purpose")),
                  publishedAt: form.get("publishedAt") || null,
                  required: form.get("required") === "on",
                  provenance: String(form.get("provenance")),
                  reason,
                });
              await onRefresh();
              onClose();
              requestAnimationFrame(() =>
                document
                  .getElementById("main-content")
                  ?.focus({ preventScroll: true }),
              );
            } catch (e) {
              setError((e as Error).message);
              throw e;
            }
          }, "Source library updated. Earlier reports are preserved.");
        }}
      >
        {mode === "edit" && (
          <>
            <label>
              Source name
              <input
                name="name"
                defaultValue={source.name}
                required
                maxLength={250}
              />
            </label>
            <div className="connected-fields">
              <label>
                Purpose
                <select name="purpose" defaultValue={source.purpose}>
                  {Object.entries(sourcePurposes).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Publication date
                <input
                  name="publishedAt"
                  type="date"
                  defaultValue={source.published_at ?? ""}
                />
              </label>
            </div>
            <label>
              Evidence origin
              <select name="provenance" defaultValue={source.provenance}>
                <option value="public">Public evidence</option>
                <option value="synthetic">Synthetic evaluation</option>
              </select>
            </label>
            <label className="connected-check">
              <input
                name="required"
                type="checkbox"
                defaultChecked={source.required}
              />
              Required for assessment coverage
            </label>
          </>
        )}
        {mode === "replace" && (
          <>
            <label>
              Replacement document
              <input name="file" type="file" accept={supportedFiles} required />
            </label>
            <p className="small muted">
              PDF, Word (.docx), Excel (.xlsx), HTML or text · Up to 20 MB. The
              replacement inherits the current purpose and publication date;
              edit its details if these change.
            </p>
            <label className="connected-check">
              <input type="checkbox" required />I have permission to use the
              replacement.
            </label>
          </>
        )}
        <label>
          Reason
          <textarea
            name="reason"
            minLength={3}
            maxLength={1000}
            rows={2}
            required
            placeholder="What changed, or why is this source being removed?"
          />
        </label>
        <div className="source-actions">
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : title}
          </Button>
          <Button
            kind="secondary"
            type="button"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}
interface Lead {
  url: string;
  title?: string;
  description?: string;
}
function leadExcerpt(description = "") {
  const text = description
    .replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g, "$1")
    .replace(/(^|\n)\s*#+\s*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > 280 ? text.slice(0, 280).trimEnd() + "…" : text;
}
export function PublicResearch({
  detail,
  busy,
  action,
  onRefresh,
  enabled,
}: {
  detail: Detail;
  busy: boolean;
  action: Action;
  onRefresh: () => Promise<void>;
  enabled: boolean;
}) {
  const [leads, setLeads] = useState<Lead[] | null>(null),
    [selected, setSelected] = useState<Lead | null>(null),
    [saved, setSaved] = useState<string[]>([]);
  return (
    <section className="connected-panel section-gap">
      <h2>Find public research</h2>
      <p>
        Search the public web, then choose which original sources to add to this
        evidence pack.
      </p>
      {!enabled && (
        <Notice title="Public search is unavailable in this environment">
          You can still upload documents or add a permitted public URL.
        </Notice>
      )}
      <form
        className="connected-form"
        onSubmit={(e) => {
          e.preventDefault();
          const query = String(new FormData(e.currentTarget).get("query"));
          void action(async () => {
            setSelected(null);
            setLeads(null);
            const result = await request<{ data: { web: Lead[] } }>(
              `/opportunities/${detail.opportunity.id}/research`,
              { query },
            );
            setLeads(result.data.web);
          });
        }}
      >
        <label>
          Research topic
          <input
            name="query"
            minLength={3}
            maxLength={300}
            required
            defaultValue={
              detail.opportunity.buyer + " " + detail.opportunity.title
            }
          />
        </label>
        <p className="small muted">
          Up to five results · reserves up to two included Firecrawl credits.
          Search snippets are leads, not cited evidence.
        </p>
        <Button type="submit" kind="secondary" disabled={busy || !enabled}>
          Search public sources
        </Button>
      </form>
      {leads && (
        <div className="section-gap" aria-live="polite">
          {!leads.length ? (
            <p>
              No leads returned. This does not establish that information is
              absent.
            </p>
          ) : (
            <ul className="research-leads">
              {leads.map((lead) => (
                <li key={lead.url}>
                  <h3>{lead.title || lead.url}</h3>
                  <p>{leadExcerpt(lead.description)}</p>
                  <a
                    href={/^https?:/.test(lead.url) ? lead.url : undefined}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open original page
                  </a>
                  <Button
                    kind="secondary"
                    disabled={busy || saved.includes(lead.url)}
                    onClick={() => setSelected(lead)}
                  >
                    {saved.includes(lead.url)
                      ? "Added to evidence"
                      : "Review and add"}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {selected && (
        <form
          key={selected.url}
          className="connected-form research-admission"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const lead = selected;
            void action(async () => {
              await request(`/opportunities/${detail.opportunity.id}/sources`, {
                name: String(f.get("name")),
                mediaType: "text/html",
                url: lead.url,
                purpose: String(f.get("purpose")),
                publishedAt: f.get("publishedAt") || null,
                provenance: "public",
                rightsConfirmed: true,
                required: true,
              });
              await onRefresh();
              setSaved((s) => [...s, lead.url]);
              setSelected(null);
            }, "Original source saved. Inspect its coverage before reassessing.");
          }}
        >
          <h3>Add the original source</h3>
          <p className="small">{selected.url}</p>
          <label>
            Source name
            <input
              name="name"
              required
              maxLength={250}
              defaultValue={(selected.title || selected.url).slice(0, 250)}
              autoFocus
            />
          </label>
          <div className="connected-fields">
            <label>
              Purpose
              <select name="purpose" defaultValue="context">
                {Object.entries(sourcePurposes).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Publication date
              <input name="publishedAt" type="date" />
            </label>
          </div>
          <label className="connected-check">
            <input type="checkbox" required />I have permission to use this
            public source.
          </label>
          <div className="source-actions">
            <Button type="submit" disabled={busy}>
              Fetch and add source
            </Button>
            <Button
              type="button"
              kind="secondary"
              onClick={() => setSelected(null)}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
