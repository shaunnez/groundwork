import { useRef, type ReactNode } from "react";
import { Button, I } from "../ui";
import type { Navigate, Page } from "./data";
export function Heading({
  title,
  eyebrow,
  description,
  actions,
  back,
  go,
}: {
  title: string;
  eyebrow?: string;
  description?: string;
  actions?: ReactNode;
  back?: { label: string; page: Page };
  go: Navigate;
}) {
  return (
    <>
      <div className="breadcrumb">
        <button onClick={() => go(back?.page || "home")}>
          <I.ArrowLeft size={14} /> {back?.label || "Home"}
        </button>
      </div>
      <header className="page-heading">
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <div className="heading-row">
          <div>
            <h1>{title}</h1>
            {description && <p className="subtitle">{description}</p>}
          </div>
          {actions && <div className="heading-actions">{actions}</div>}
        </div>
      </header>
    </>
  );
}
export function WorkspaceHeader({
  page,
  go,
  onSignOut,
  opportunityId,
  showSourceTool = true,
}: {
  page: Page;
  go: Navigate;
  onSignOut: () => void;
  opportunityId?: string;
  showSourceTool?: boolean;
}) {
  const menu = useRef<HTMLDetailsElement>(null);
  const operator = ["ops", "delivery", "mapping", "sectors"].includes(page);
  const active = operator
    ? page
    : ["home", "market", "reports"].includes(page)
      ? page
      : page === "firm"
        ? "firm"
        : ["report", "brief"].includes(page)
          ? "reports"
          : "watchlist";
  return (
    <>
      <a
        href="#main-content"
        className="skip-link"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("main-content")?.focus();
        }}
      >
        Skip to content
      </a>
      <header className="topbar">
        <button className="wordmark" onClick={() => go("home")}>
          Groundwork
        </button>
        <nav aria-label="Main navigation">
          {(operator
            ? [
                ["Review queue", "ops"],
                ["GETS mapping", "mapping"],
                ["Sectors", "sectors"],
                ["Refresh & delivery", "delivery"],
              ]
            : [
                ["Home", "home"],
                ["Watchlist", "watchlist"],
                ["Market", "market"],
                ["Reports", "reports"],
              ]
          ).map(([label, id]) => (
            <button
              key={id}
              className={active === id ? "active" : ""}
              aria-current={active === id ? "page" : undefined}
              onClick={() => go(id as Page)}
            >
              {label}
            </button>
          ))}
        </nav>
        <details
          className="account-menu"
          key={page}
          ref={menu}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              menu.current!.open = false;
              menu.current?.querySelector("summary")?.focus();
            }
          }}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null))
              e.currentTarget.open = false;
          }}
        >
          <summary aria-label="Workspace account">
            <span>Workspace</span>
            <I.Caret size={16} />
            <span className="avatar">GW</span>
          </summary>
          <div className="account-popover">
            <strong>Your workspace</strong>
            <button onClick={() => go("firm")}>
              <I.Buildings />
              Firm profiles
            </button>
            <button onClick={onSignOut}>
              <I.SignOut />
              Sign out
            </button>
          </div>
        </details>
      </header>
      {!operator && opportunityId && showSourceTool && (
        <nav className="opportunity-tools" aria-label="Opportunity tools">
          <span>Opportunity workspace</span>
          <button
            aria-current={page === "sources" ? "page" : undefined}
            onClick={() => go("sources", opportunityId)}
          >
            <I.File size={16} /> Sources
          </button>
        </nav>
      )}
      {operator && (
        <div className="audience-banner">
          <Button kind="text" onClick={() => go("home")}>
            <I.ArrowLeft size={16} /> Return to workspace
          </Button>
          <strong>BidEdge reviewer tools</strong>
          <span>
            Internal review and local delivery. Customer publication is not
            enabled.
          </span>
        </div>
      )}
    </>
  );
}
export function WorkspaceFooter({ go }: { go: Navigate }) {
  return (
    <footer className="workspace-footer connected-footer">
      <span>Groundwork by BidEdge · Private evaluation</span>
      <div className="inline">
        <Button kind="text" onClick={() => go("ops")}>
          Reviewer tools
        </Button>
        <a href="/prototype/#/home" target="_blank" rel="noreferrer">
          Original design reference
        </a>
      </div>
    </footer>
  );
}
