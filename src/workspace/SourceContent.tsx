import { useEffect, useRef, useState } from "react";
import { Button } from "../ui";
import { quoteSpan } from "../../shared/source-geometry";

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
  quote,
}: {
  text: string;
  mediaType: string;
  quote?: string;
}) {
  const [raw, setRaw] = useState(false);
  const mark = useRef<HTMLElement>(null);
  const span = quote ? quoteSpan(text, quote) : null;
  useEffect(() => {
    if (span)
      mark.current?.scrollIntoView({ block: "center", behavior: "instant" });
  }, [text, quote, span?.start]);
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
      {quote && !span && (
        <p className="small muted" role="status">
          The quoted wording could not be uniquely located in this extracted
          section. No text has been marked.
        </p>
      )}
      {structured && !raw && !quote ? (
        <FieldValue value={data} />
      ) : (
        <div className="connected-source-text">
          {span ? (
            <>
              {text.slice(0, span.start)}
              <mark ref={mark} className="source-quote-mark">
                {text.slice(span.start, span.end)}
              </mark>
              {text.slice(span.end)}
            </>
          ) : (
            text
          )}
        </div>
      )}
    </>
  );
}
