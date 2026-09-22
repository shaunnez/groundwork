import { useState } from "react";
import { Button } from "../ui";

function FieldValue({ value, depth = 0 }: { value: unknown; depth?: number }) {
  if (value === null) return <span className="muted">null</span>;
  if (depth >= 12 && typeof value === "object")
    return (
      <details>
        <summary>Inspect deeply nested source fields</summary>
        <div className="connected-source-text">
          {JSON.stringify(value, null, 2)}
        </div>
      </details>
    );
  if (Array.isArray(value))
    return value.length ? (
      <ol className="source-records">
        {value.map((item, i) => (
          <li key={i}>
            <FieldValue value={item} depth={depth + 1} />
          </li>
        ))}
      </ol>
    ) : (
      <span className="muted">Empty list</span>
    );
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    return entries.length ? (
      <dl className="source-fields">
        {entries.map(([key, item]) => (
          <div key={key}>
            <dt>{key}</dt>
            <dd>
              <FieldValue value={item} depth={depth + 1} />
            </dd>
          </div>
        ))}
      </dl>
    ) : (
      <span className="muted">Empty object</span>
    );
  }
  return <span>{String(value)}</span>;
}

/** Presents structured source fields without summarising or changing their values. */
export function SourceContent({
  text,
  mediaType,
}: {
  text: string;
  mediaType: string;
}) {
  const [raw, setRaw] = useState(false);
  let data: unknown;
  let structured = false;
  if (mediaType.includes("json")) {
    try {
      data = JSON.parse(text);
      structured = data !== null && typeof data === "object";
    } catch {
      // Some extracted JSON sections are partial; retain their exact source text.
    }
  }
  return (
    <>
      {structured && (
        <div className="source-view-switch">
          <span className="small muted">Original field names and values</span>
          <Button kind="text" aria-pressed={raw} onClick={() => setRaw(!raw)}>
            {raw ? "Read structured fields" : "View exact source text"}
          </Button>
        </div>
      )}
      {structured && !raw ? (
        <FieldValue value={data} />
      ) : (
        <div className="connected-source-text">{text}</div>
      )}
    </>
  );
}
