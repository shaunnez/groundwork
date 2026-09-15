import {
  useEffect,
  useRef,
  type ReactNode,
  type ButtonHTMLAttributes,
} from "react";
import {
  ArrowRightIcon,
  ArrowLeftIcon,
  CheckCircleIcon,
  CircleIcon,
  ClockIcon,
  WarningCircleIcon,
  WarningIcon,
  FileTextIcon,
  XIcon,
  LockSimpleIcon,
  UploadSimpleIcon,
  SpinnerGapIcon,
  BuildingsIcon,
  ArrowClockwiseIcon,
  CaretDownIcon,
  MagnifyingGlassIcon,
  BookmarkSimpleIcon,
  LinkIcon,
  EyeIcon,
  InfoIcon,
  PlusIcon,
  PlayIcon,
  PauseIcon,
  CheckIcon,
  ListIcon,
  GearSixIcon,
  SignOutIcon,
  EnvelopeSimpleIcon,
  ChartBarIcon,
  CalendarBlankIcon,
  DownloadSimpleIcon,
} from "@phosphor-icons/react";
import { useDemo } from "./context";
export const I = {
  ArrowRight: ArrowRightIcon,
  ArrowLeft: ArrowLeftIcon,
  CheckCircle: CheckCircleIcon,
  Circle: CircleIcon,
  Clock: ClockIcon,
  WarningCircle: WarningCircleIcon,
  Warning: WarningIcon,
  File: FileTextIcon,
  X: XIcon,
  Lock: LockSimpleIcon,
  Upload: UploadSimpleIcon,
  Spinner: SpinnerGapIcon,
  Buildings: BuildingsIcon,
  Refresh: ArrowClockwiseIcon,
  Caret: CaretDownIcon,
  Search: MagnifyingGlassIcon,
  Bookmark: BookmarkSimpleIcon,
  Link: LinkIcon,
  Eye: EyeIcon,
  Info: InfoIcon,
  Plus: PlusIcon,
  Play: PlayIcon,
  Pause: PauseIcon,
  Check: CheckIcon,
  List: ListIcon,
  Settings: GearSixIcon,
  SignOut: SignOutIcon,
  Email: EnvelopeSimpleIcon,
  Chart: ChartBarIcon,
  Calendar: CalendarBlankIcon,
  Download: DownloadSimpleIcon,
};
export function Button({
  children,
  kind = "primary",
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  kind?: "primary" | "secondary" | "text" | "danger";
}) {
  return (
    <button
      type={type}
      className={"button " + kind + " " + className}
      {...props}
    >
      {children}
    </button>
  );
}
export function Badge({
  children,
  tone = "neutral",
  dot = false,
}: {
  children: ReactNode;
  tone?: string;
  dot?: boolean;
}) {
  return (
    <span className={"badge " + tone}>
      {dot && <I.Circle weight="fill" size={9} />} {children}
    </span>
  );
}
export function Notice({
  children,
  title,
  tone = "warning",
  action,
}: {
  children?: ReactNode;
  title: string;
  tone?: string;
  action?: ReactNode;
}) {
  return (
    <div
      className={"notice " + tone}
      role={tone === "error" ? "alert" : "status"}
    >
      {tone === "success" ? (
        <I.CheckCircle size={21} />
      ) : tone === "info" ? (
        <I.Info size={21} />
      ) : (
        <I.WarningCircle size={21} />
      )}
      <div>
        <strong>{title}</strong>
        {children && <div className="notice-copy">{children}</div>}
      </div>
      {action && <div className="notice-action">{action}</div>}
    </div>
  );
}
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  breadcrumb,
  staticBreadcrumb = false,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  breadcrumb?: string;
  staticBreadcrumb?: boolean;
}) {
  const { go } = useDemo();
  return (
    <>
      <div className="breadcrumb">
        {staticBreadcrumb ? (
          <span>{breadcrumb || "Workspace"}</span>
        ) : (
          <button
            onClick={() =>
              go(
                breadcrumb === "Market"
                  ? "market"
                  : breadcrumb === "Operations"
                    ? "ops"
                    : breadcrumb === "Reports"
                      ? "reports"
                      : "home",
              )
            }
          >
            {breadcrumb || "Workspace"}
          </button>
        )}
        <span>/</span>
        <span>{title}</span>
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
export function Empty({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <section className="empty-state">
      <I.File size={38} weight="light" />
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </section>
  );
}
export function Loading({
  label = "Loading your workspace",
  rows = 4,
}: {
  label?: string;
  rows?: number;
}) {
  return (
    <section className="loading-state" role="status" aria-label={label}>
      <p className="inline">
        <I.Spinner className="spin" size={19} />
        {label}…
      </p>
      <div className="skeleton-heading" />
      {Array.from({ length: rows }, (_, i) => (
        <div className="skeleton-row" key={i}>
          <div />
          <div />
          <div />
        </div>
      ))}
      <span className="muted">Your saved work will appear here.</span>
    </section>
  );
}
export function StateBoundary({
  children,
  emptyTitle = "Nothing here yet",
  emptyDescription = "There are no items to display.",
  loadingLabel,
  emptyAction,
  errorTitle = "We couldn’t load this view",
  inlineError = false,
}: {
  children: ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
  loadingLabel?: string;
  emptyAction?: ReactNode;
  errorTitle?: string;
  inlineError?: boolean;
}) {
  const { scene, go, page } = useDemo();
  if (scene === "loading") return <Loading label={loadingLabel} />;
  if (scene === "empty")
    return (
      <Empty
        title={emptyTitle}
        description={emptyDescription}
        action={
          emptyAction || (
            <Button kind="secondary" onClick={() => go(page)}>
              Return to populated view
            </Button>
          )
        }
      />
    );
  if (scene === "error" && !inlineError)
    return (
      <Empty
        title={errorTitle}
        description="Your previously saved work is safe. Try again to load the last accepted version."
        action={
          <Button onClick={() => go(page)}>
            <I.Refresh size={17} />
            Try again
          </Button>
        }
      />
    );
  if (scene === "unavailable")
    return (
      <Empty
        title="This content isn’t available"
        description="The source may no longer be available, or it may require access from its owning firm. Another version has not been substituted."
        action={
          <Button kind="secondary" onClick={() => go("sources")}>
            Back to your sources
          </Button>
        }
      />
    );
  return <>{children}</>;
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const active = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      active?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Close dialog"
        >
          <I.X size={22} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Tabs({ items }: { items: { label: string; id: string }[] }) {
  const { page, go } = useDemo();
  return (
    <nav className="subnav" aria-label="Section navigation">
      {items.map((item) => (
        <button
          key={item.id}
          className={page === item.id ? "active" : ""}
          onClick={() => go(item.id)}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}
export function KeyFacts({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="key-facts">
      {items.map(([key, value]) => (
        <div key={key}>
          <dt>{key}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
export function Search({
  value,
  onChange,
  placeholder = "Search",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="search-field">
      <I.Search size={19} />
      <input
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
