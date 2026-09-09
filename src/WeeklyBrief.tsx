import { useDemo } from "./context";
import { Badge, Button, I, Notice, PageHeader, StateBoundary } from "./ui";

export function WeeklyBrief() {
  const { demo, scene, go } = useDemo();
  const items = [
    {
      tag: "Deadline changed",
      title: "More time to review the digital programme.",
      body: "Harbour Regional Council extended the close from 17 to 24 September. Your certification and delivery checks still need review.",
      source: "GETS notice · revision 3 · captured 9 Sep",
      action: "Review opportunity",
      page: "pursuit",
      state: "stale",
    },
    {
      tag: "Planning signal",
      title: "A service design panel is on the horizon.",
      body: "Southern Services Agency’s procurement plan indicates Q4 2026. No open tender or confirmed date has been found.",
      source: "Agency procurement plan · page 8 · version 2",
      action: "Read the planning signal",
      page: "signal",
      state: "normal",
    },
    {
      tag: "Inferred renewal",
      title: "A potential renewal needs closer investigation.",
      body: "A historical award and assumed five-year term suggest January–March 2027. Extensions and the current incumbent remain unconfirmed.",
      source: "Published award record + explicit term assumption",
      action: "Inspect the forecast",
      page: "renewals",
      state: "normal",
    },
  ];
  return (
    <>
      <PageHeader
        eyebrow="WEEKLY INTELLIGENCE BRIEF"
        title="Your week in procurement."
        description={"7–13 September 2026 · prepared for " + demo.firm}
        breadcrumb="Reports"
        actions={<Badge tone="success">Published · version 1</Badge>}
      />
      <StateBoundary
        emptyTitle="A quiet week for your interests"
        emptyDescription="No matching accepted notices or signals were available. Your watchlist and earlier briefs are still available."
        emptyAction={
          <Button onClick={() => go("watchlist")}>Open watchlist</Button>
        }
        loadingLabel="Opening your weekly brief"
      >
        {scene === "processing" && (
          <Notice title="Your next brief is being prepared" tone="info">
            The last published brief remains available while new sources are
            checked.
          </Notice>
        )}
        {scene === "partial" && (
          <Notice title="One source could not be included">
            This brief uses the accepted sources below. Policy updates are
            incomplete and are not presented as current.
          </Notice>
        )}
        <div className="report-layout">
          <aside className="report-outline">
            <span className="eyebrow">THIS WEEK</span>
            <p>
              1 opportunity change
              <br />1 planning signal
              <br />1 inferred renewal
            </p>
            <Button kind="text" onClick={() => go("preferences")}>
              Delivery preferences <I.ArrowRight size={16} />
            </Button>
          </aside>
          <article className="report-body">
            <h2>Three things worth your attention.</h2>
            <p className="lead">
              A short reading list, grounded in the sources. Your firm’s pursuit
              decisions remain yours.
            </p>
            {items.map((item, index) => (
              <section className="brief-item" key={item.title}>
                <Badge tone={index === 0 ? "warning" : "neutral"}>
                  {item.tag}
                </Badge>
                <h2>{item.title}</h2>
                <p>{item.body}</p>
                <p className="muted small">{item.source}</p>
                <Button
                  kind="secondary"
                  onClick={() => go(item.page, item.state)}
                >
                  {item.action} <I.ArrowRight size={16} />
                </Button>
              </section>
            ))}
            <footer className="report-end">
              Fictional sample · prepared 9 Sep 2026 · no email sent
            </footer>
          </article>
        </div>
      </StateBoundary>
    </>
  );
}
