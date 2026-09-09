import { incumbent, awardRows } from "./intelligence-data";
import { supplierNames } from "./catalogue";
import { useState } from "react";
import { useDemo } from "./context";
import { opportunities } from "./catalogue";
import {
  Badge,
  Button,
  Empty,
  I,
  KeyFacts,
  Modal,
  Notice,
  PageHeader,
  Search,
  StateBoundary,
  Tabs,
} from "./ui";
const marketTabs = [
  { label: "Overview", id: "market" },
  { label: "Agencies", id: "agencies" },
  { label: "Competitors", id: "competitors" },
  { label: "Award history", id: "awards" },
  { label: "Renewal forecasts", id: "renewals" },
];
const agencyNames = [
  "Harbour Regional Council",
  "Southern Services Agency",
  "North Coast Council",
];

export function Watchlist() {
  const { demo, setDemo, scene, go } = useDemo();
  const [search, setSearch] = useState("");
  const [region, setRegion] = useState("All regions");
  const [filter, setFilter] = useState("For your firm");
  const [detail, setDetail] = useState<number | null>(null);
  const rows = opportunities
    .map((v, i) => ({ ...v, index: i }))
    .filter(
      (v) =>
        (v.title + " " + v.agency)
          .toLowerCase()
          .includes(search.toLowerCase()) &&
        (region === "All regions" || v.region === region) &&
        (filter !== "Saved" || demo.saved.includes(v.title)),
    );
  const save = (title: string) =>
    setDemo((d) => ({
      ...d,
      saved: d.saved.includes(title)
        ? d.saved.filter((v) => v !== title)
        : [...d.saved, title],
    }));
  return (
    <>
      <PageHeader
        eyebrow="YOUR OPPORTUNITY WATCHLIST"
        title="Focus on the right opportunities."
        description="Relevant government work, important changes and a clearer next step."
        actions={
          <Button kind="secondary" onClick={() => go("firm")}>
            Edit your interests
          </Button>
        }
      />
      <div className="watchlist-summary">
        <span>
          <I.Circle weight="fill" size={8} className="green" />
          Notice feed checked 9 Sep, 08:15 NZST
        </span>
        <span>Digital & advisory · {demo.region}</span>
        <button onClick={() => go("brief")}>
          Read your weekly brief <I.ArrowRight size={15} />
        </button>
      </div>
      <div className="filter-row">
        <div className="segmented">
          {["For your firm", "Saved"].map((v) => (
            <button
              className={filter === v ? "active" : ""}
              key={v}
              onClick={() => setFilter(v)}
            >
              {v}
            </button>
          ))}
        </div>
        <Search
          value={search}
          onChange={setSearch}
          placeholder="Search opportunities"
        />
        <select
          aria-label="Filter by region"
          value={region}
          onChange={(e) => setRegion(e.target.value)}
        >
          {["All regions", "Auckland", "Wellington", "Nationwide"].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </div>
      <StateBoundary
        emptyTitle="Let’s find the right work for your firm"
        emptyDescription="No matching notices are available in this sample. Broaden your regions or services to see more opportunities."
        emptyAction={<Button onClick={() => go("firm")}>Edit interests</Button>}
        errorTitle="The notice feed could not be refreshed"
      >
        {scene === "stale" && (
          <Notice title="Refresh interrupted · showing the last accepted feed">
            Last successful check: 8 Sep, 08:15 NZST. Closing dates may have
            changed.
            <Button kind="text" onClick={() => go("watchlist")}>
              Retry refresh
            </Button>
          </Notice>
        )}
        <div className="list-heading">
          <strong>{rows.length} relevant opportunities</strong>
          <span>Relevant sample notices · no combined score</span>
        </div>
        <div className="opportunity-list">
          {rows.map((v) => (
            <article key={v.title} className="opportunity-row">
              <div>
                <div className="eyebrow">{v.agency}</div>
                <button
                  className="opportunity-title"
                  onClick={() =>
                    v.index === 0 ? go("pursuit") : setDetail(v.index)
                  }
                >
                  {v.title}
                </button>
                <p>
                  {v.sector} <span>·</span> {v.region}
                </p>
                <div className="opportunity-badges">
                  <Badge>{v.sector}</Badge>
                  <Badge>
                    {v.index === 4 ? "Indicative" : "Value undisclosed"}
                  </Badge>
                  <Badge
                    tone={
                      v.index === 0 || v.index === 2 ? "warning" : "neutral"
                    }
                  >
                    {v.tag}
                  </Badge>
                </div>
                <div className="watch-intelligence">
                  {v.index === 0 ? (
                    <>
                      <p>
                        <strong>Competitive field:</strong> Aster · agency
                        relationship; Tern · delivery experience; Ridgeline ·
                        advisory fit.
                      </p>
                      <p>
                        <strong>Incumbent:</strong>{" "}
                        {demo.reportHistory.at(-1)?.kind ===
                        "Document assessment"
                          ? incumbent.rfp
                          : incumbent.public}
                        .
                      </p>
                      <p>
                        <strong>Watch point:</strong>{" "}
                        {demo.reportHistory.at(-1)?.kind ===
                        "Document assessment"
                          ? "RFP excludes platform delivery; the earlier bundling flag is retracted."
                          : "The notice leaves advisory and platform scope unclear."}
                      </p>
                    </>
                  ) : v.index === 2 ? (
                    <p>
                      <strong>Enrichment queued.</strong> The notice is
                      available; bidders and incumbent have not been assessed.
                    </p>
                  ) : v.index === 4 ? (
                    <p>
                      <strong>Planning signal.</strong> This is not yet an open
                      tender; no bidder assessment is implied.
                    </p>
                  ) : (
                    <p>
                      <strong>Limited research.</strong> No reasoned bidder
                      assessment is available in this sample.
                    </p>
                  )}
                </div>
              </div>
              <div className="opportunity-deadline">
                <small>{v.type}</small>
                <strong>{v.index === 4 ? v.close : "Closes " + v.close}</strong>
                <button
                  className="text-button"
                  onClick={() =>
                    v.index === 0 ? go("pursuit") : setDetail(v.index)
                  }
                >
                  {v.index === 0 ? "Review opportunity" : "View notice"}
                  <I.ArrowRight size={17} />
                </button>
              </div>
              <button
                className={
                  "icon-button " + (demo.saved.includes(v.title) ? "green" : "")
                }
                aria-label={
                  (demo.saved.includes(v.title) ? "Unsave " : "Save ") + v.title
                }
                onClick={() => save(v.title)}
              >
                <I.Bookmark
                  size={21}
                  weight={demo.saved.includes(v.title) ? "fill" : "regular"}
                />
              </button>
            </article>
          ))}
        </div>
        {!rows.length && (
          <Empty
            title="No matches for those filters"
            description="Try a broader search or return to all opportunities."
            action={
              <Button
                kind="secondary"
                onClick={() => {
                  setSearch("");
                  setFilter("For your firm");
                  setRegion("All regions");
                }}
              >
                Clear filters
              </Button>
            }
          />
        )}
      </StateBoundary>
      {detail !== null && (
        <Modal
          title={opportunities[detail].title}
          onClose={() => setDetail(null)}
        >
          <KeyFacts
            items={[
              ["Agency", opportunities[detail].agency],
              ["Type", opportunities[detail].type],
              ["Closing / indicative date", opportunities[detail].close],
              ["Region", opportunities[detail].region],
            ]}
          />
          <Notice title="Public notice preview" tone="info">
            This sample has no completed pursuit assessment. The digital
            transformation opportunity contains the full interactive review
            journey.
          </Notice>
          <div className="form-actions">
            <Button
              kind="secondary"
              onClick={() => save(opportunities[detail].title)}
            >
              {demo.saved.includes(opportunities[detail].title)
                ? "Remove from saved"
                : "Save opportunity"}
            </Button>
            <Button
              onClick={() => {
                setDetail(null);
                go("pursuit");
              }}
            >
              Open the full sample assessment
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
export function Market() {
  const { scene, go } = useDemo();
  return (
    <>
      <PageHeader
        eyebrow="MARKET INTELLIGENCE"
        title="Context before commitment."
        description="Understand the agencies, suppliers and plans shaping your market."
        breadcrumb="Market"
      />
      <Tabs items={marketTabs} />
      <StateBoundary
        emptyTitle="Your market view is taking shape"
        emptyDescription="Add services and regions to your firm profile to identify relevant signals."
        emptyAction={<Button onClick={() => go("firm")}>Set interests</Button>}
      >
        {scene === "partial" && (
          <Notice title="One agency plan could not be refreshed">
            Signals from its previous version are marked for review. Current
            sources remain available.
          </Notice>
        )}
        <div className="market-feature">
          <div>
            <span className="eyebrow">PROCUREMENT PLAN · CHECKED 8 SEP</span>
            <h2>A service design panel is on the horizon.</h2>
            <p>
              Southern Services Agency’s plan indicates a Q4 2026 panel.
              Requirements and dates have not been announced.
            </p>
            <Button onClick={() => go("signal")}>
              Explore the signal <I.ArrowRight size={17} />
            </Button>
          </div>
          <div className="feature-aside">
            <span className="eyebrow">WHAT WE KNOW</span>
            <KeyFacts
              items={[
                ["Timing", "Q4 2026 · indicative"],
                ["Basis", "Agency procurement plan, p. 8"],
                ["Tender status", "No open tender yet"],
              ]}
            />
          </div>
        </div>
        <div className="two-col">
          <section>
            <div className="section-heading">
              <h2>Agencies in your market</h2>
              <Button kind="text" onClick={() => go("agencies")}>
                All agencies <I.ArrowRight size={16} />
              </Button>
            </div>
            {agencyNames.map((name, i) => (
              <button
                className="directory-row"
                key={name}
                onClick={() => go("agency", "normal", { id: String(i) })}
              >
                <I.Buildings size={24} weight="light" />
                <div>
                  <strong>{name}</strong>
                  <span>
                    {i === 0
                      ? "1 relevant open tender"
                      : i === 1
                        ? "1 planning signal"
                        : "1 inferred renewal"}
                  </span>
                </div>
                <I.ArrowRight size={18} />
              </button>
            ))}
          </section>
          <section>
            <div className="section-heading">
              <h2>Worth a closer look</h2>
            </div>
            <article className="editorial-row">
              <Badge tone="warning">Inferred renewal</Badge>
              <h3>Analytics support contract</h3>
              <p>
                A potential early-2027 renewal, inferred from historical award
                data. Timing is unconfirmed.
              </p>
              <Button kind="text" onClick={() => go("renewals")}>
                Inspect assumptions <I.ArrowRight size={16} />
              </Button>
            </article>
            <article className="editorial-row">
              <Badge>Historical evidence</Badge>
              <h3>Who has delivered similar work?</h3>
              <p>
                Inspect award records and known participation, with contract
                values at their original grain.
              </p>
              <Button kind="text" onClick={() => go("awards")}>
                Explore award history <I.ArrowRight size={16} />
              </Button>
            </article>
          </section>
        </div>
      </StateBoundary>
    </>
  );
}
export function Directory({ competitors = false }: { competitors?: boolean }) {
  const { go } = useDemo();
  const [search, setSearch] = useState("");
  const names = competitors ? supplierNames : agencyNames;
  const rows = names
    .map((name, id) => ({ name, id }))
    .filter((v) => v.name.toLowerCase().includes(search.toLowerCase()));
  return (
    <>
      <PageHeader
        title={
          competitors
            ? "Know the competitive landscape."
            : "Understand the buyer."
        }
        description={
          competitors
            ? "Historical participation and relevant capabilities, with their sources."
            : "Agencies relevant to your firm, with procurement activity in context."
        }
        breadcrumb="Market"
      />
      <Tabs items={marketTabs} />
      <Search
        value={search}
        onChange={setSearch}
        placeholder={competitors ? "Search competitors" : "Search agencies"}
      />
      <StateBoundary
        emptyTitle={
          competitors ? "No matching suppliers yet" : "No matching agencies yet"
        }
        emptyDescription="Broaden your interests or search to explore more of the market."
      >
        {rows.map(({ name, id }) => (
          <button
            key={name}
            className="directory-row large"
            onClick={() =>
              go(competitors ? "competitor" : "agency", "normal", {
                id: String(id),
              })
            }
          >
            <I.Buildings size={30} weight="light" />
            <div>
              <h2>{name}</h2>
              <p>
                {competitors
                  ? "Digital advisory · evidence from public award notices"
                  : id === 0
                    ? "Local government · Auckland"
                    : id === 1
                      ? "Public services · nationwide"
                      : "Local government · North Island"}
              </p>
            </div>
            <Badge>
              {competitors ? "Historical participant" : "Public agency"}
            </Badge>
            <I.ArrowRight size={20} />
          </button>
        ))}
        {!rows.length && (
          <Empty
            title="No matches"
            description="Try another name."
            action={
              <Button kind="text" onClick={() => setSearch("")}>
                Clear search
              </Button>
            }
          />
        )}
      </StateBoundary>
    </>
  );
}
export function EntityProfile({
  competitor = false,
}: {
  competitor?: boolean;
}) {
  const { params, scene, go } = useDemo();
  const names = competitor ? supplierNames : agencyNames;
  const id = Math.min(
    names.length - 1,
    Math.max(0, Number(params.get("id") || 0)),
  );
  const name = names[id];
  return (
    <>
      <PageHeader
        eyebrow={competitor ? "SUPPLIER INTELLIGENCE" : "AGENCY INTELLIGENCE"}
        title={name}
        description={
          competitor
            ? "Historical participation, capability context and open questions."
            : "Relevant procurement activity, published plans and award history."
        }
        breadcrumb="Market"
        actions={
          <Button
            onClick={() =>
              go(
                competitor ? "request" : "watchlist",
                "normal",
                competitor ? { kind: "competitor", id: String(id) } : {},
              )
            }
          >
            {competitor
              ? "Request competitor assessment"
              : "View opportunities"}
            <I.ArrowRight size={17} />
          </Button>
        }
      />
      <Tabs items={marketTabs} />
      <StateBoundary>
        {scene === "processing" && (
          <Notice title="Competitor research is in progress" tone="info">
            Previously accepted historical records remain available.
            <Button kind="text" onClick={() => go("processing", "processing")}>
              View request
            </Button>
          </Notice>
        )}
        {(scene === "partial" || scene === "stale") && (
          <Notice
            title={
              scene === "stale"
                ? "One source needs a fresh review"
                : "Evidence coverage is limited"
            }
          >
            Absence from these records is not proof of no experience or no
            participation.
          </Notice>
        )}
        <div className="two-col">
          <article>
            <span className="eyebrow">
              {competitor ? "ASSESSMENT" : "OVERVIEW"}
            </span>
            <h2>
              {competitor
                ? "Relevant history. Unconfirmed intent."
                : "Digital services are an active priority."}
            </h2>
            <p className="lead">
              {competitor
                ? name +
                  " appears in public award records for related advisory work. Those records establish historical participation, not current incumbency or a commitment to bid."
                : name +
                  " has published material relating to digital services and customer experience. Its current notices and plans should be reviewed separately."}
            </p>
            <KeyFacts
              items={
                competitor
                  ? [
                      ["Participation", "Recorded in historical awards"],
                      ["Current incumbent", "Not established"],
                      ["Bid intention", "Unknown"],
                    ]
                  : [
                      ["Source check", "8 Sep 2026"],
                      ["Active notice", "Digital service transformation"],
                      ["Planning window", "Q4 2026 · indicative"],
                    ]
              }
            />
            <h2>
              {competitor
                ? "Evidence, not a probability"
                : "Recent procurement context"}
            </h2>
            <p>
              {competitor
                ? "No calibrated win probability is assigned. A qualitative assessment can consider scope, dated evidence and coverage gaps."
                : "A published plan indicates intentions. Confirmed scope and deadlines come from the current tender notice and its addenda."}
            </p>
            <Button kind="text" onClick={() => go("awards")}>
              Inspect underlying award records <I.ArrowRight size={17} />
            </Button>
          </article>
          <aside>
            <h2>Sources and related work</h2>
            <article className="editorial-row">
              <Badge>Public award record</Badge>
              <h3>Digital advisory services</h3>
              <p>
                2024 award · total contract value NZ$1.2m. Allocation between
                suppliers is not disclosed.
              </p>
              <Button kind="text" onClick={() => go("awards")}>
                View record
              </Button>
            </article>
            <article className="editorial-row">
              <Badge>Agency procurement plan</Badge>
              <h3>Service design panel</h3>
              <p>Indicative Q4 2026 window. No open tender yet.</p>
              <Button kind="text" onClick={() => go("signal")}>
                View signal
              </Button>
            </article>
            <Notice title="Fictional demonstration" tone="info">
              All organisations and example records in this prototype are
              fictional.
            </Notice>
          </aside>
        </div>
      </StateBoundary>
    </>
  );
}
export function Awards() {
  const { scene, go } = useDemo();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const rows = awardRows.filter((r) =>
    r.join(" ").toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <PageHeader
        title="History at its proper scale."
        description="Contract-level award records. Categories and regions do not multiply value."
        breadcrumb="Market"
      />
      <Tabs items={marketTabs} />
      <Search
        value={search}
        onChange={setSearch}
        placeholder="Search awards, agencies or suppliers"
      />
      <StateBoundary
        emptyTitle="No award records match"
        emptyDescription="This is not proof a supplier has never delivered government work."
      >
        {scene === "partial" && (
          <Notice title="Supplier allocations are not available">
            Values below describe whole contracts, not revenue attributed to
            each supplier.
          </Notice>
        )}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Contract</th>
                <th>Agency / suppliers</th>
                <th>Year</th>
                <th>Total contract value</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r[0]}>
                  <td>
                    <button
                      className="table-title"
                      onClick={() => setSelected(i)}
                    >
                      {r[0]}
                    </button>
                    <small>MBIE-derived fictional fixture</small>
                  </td>
                  <td>
                    {r[1]}
                    <small>{r[2]}</small>
                  </td>
                  <td>{r[3]}</td>
                  <td>
                    {r[4]}
                    <small>
                      {r[2].includes("+")
                        ? "Supplier allocation unknown"
                        : "Single named supplier"}
                    </small>
                  </td>
                  <td>
                    <Button
                      kind="text"
                      aria-label={"Inspect " + r[0]}
                      onClick={() => setSelected(i)}
                    >
                      <I.ArrowRight size={18} />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && (
            <Empty
              title="No matches"
              description="Try another contract, agency or supplier."
            />
          )}
        </div>
      </StateBoundary>
      {selected !== null && rows[selected] && (
        <Modal title={rows[selected][0]} onClose={() => setSelected(null)}>
          <KeyFacts
            items={[
              ["Contract value", rows[selected][4]],
              [
                "Supplier allocation",
                rows[selected][2].includes("+")
                  ? "Unknown · do not attribute the whole value"
                  : "Single named supplier",
              ],
              ["Categories", "Digital services; professional advice"],
              ["Regions", "Auckland; nationwide"],
            ]}
          />
          <Notice title="One contract, one amount" tone="info">
            Multiple categories, regions or suppliers do not create additional
            contract value.
          </Notice>
          <Button
            kind="text"
            onClick={() => {
              setSelected(null);
              go("competitor", "normal", {
                id: rows[selected][2] === "Tern Digital" ? "1" : "0",
              });
            }}
          >
            Open supplier profile
          </Button>
        </Modal>
      )}
    </>
  );
}
export function Signal() {
  const { scene, go, setDemo, notify } = useDemo();
  return (
    <>
      <PageHeader
        eyebrow="AGENCY PROCUREMENT PLAN"
        title="Service design panel"
        description="Southern Services Agency · planning signal"
        breadcrumb="Market"
        actions={
          <Button
            kind="secondary"
            onClick={() => {
              setDemo((d) => ({
                ...d,
                saved: [...new Set([...d.saved, "Service design panel"])],
              }));
              notify("Planning signal saved to your watchlist.");
            }}
          >
            <I.Bookmark size={17} />
            Save signal
          </Button>
        }
      />
      <StateBoundary>
        {scene === "stale" && (
          <Notice title="This source needs review">
            The agency has published a newer plan. This signal retains the
            earlier source version.
          </Notice>
        )}
        {scene === "conflict" && (
          <Notice title="The timing is inconsistent across sources">
            The plan says Q4 2026; a later update says timing is under review.
            No confirmed tender date is inferred.
          </Notice>
        )}
        <div className="two-col">
          <article>
            <h2>What the source says</h2>
            <p className="lead">
              A service design panel is listed in the agency’s procurement plan
              for Q4 2026.
            </p>
            <KeyFacts
              items={[
                ["Indicative window", "October–December 2026"],
                ["Published tender", "Not yet available"],
                ["Source check", "8 Sep 2026"],
              ]}
            />
            <Notice title="Planning signal — no open tender yet">
              Requirements, value and final dates have not been announced.
            </Notice>
            <h2>What this may mean for your firm</h2>
            <p>
              The proposed scope could align with your advisory services. This
              is an interpretation, not a confirmed fit or eligibility
              assessment.
            </p>
            <Button onClick={() => go("agency", "normal", { id: "1" })}>
              Explore the agency <I.ArrowRight size={17} />
            </Button>
          </article>
          <aside className="source-excerpt">
            <span className="eyebrow">SOURCE EXCERPT · VERSION 2</span>
            <h2>Annual procurement plan</h2>
            <blockquote>
              “Service design panel — indicative procurement period: Q4 2026.”
            </blockquote>
            <p className="muted">Fictional agency publication · page 8</p>
            <Button
              kind="text"
              onClick={() =>
                go("document", "normal", { source: "3", page: "8" })
              }
            >
              Open captured source <I.ArrowRight size={17} />
            </Button>
          </aside>
        </div>
      </StateBoundary>
    </>
  );
}
export function Renewals() {
  const { scene, go } = useDemo();
  const [open, setOpen] = useState(false);
  return (
    <>
      <PageHeader
        title="Prepare for what might come next."
        description="Renewal windows inferred from historical records, with assumptions visible."
        breadcrumb="Market"
      />
      <Tabs items={marketTabs} />
      <StateBoundary
        emptyTitle="No supported renewal signals"
        emptyDescription="No forecast is better than inventing a contract end date."
      >
        {scene === "partial" && (
          <Notice title="Contract duration is not confirmed">
            The estimate below uses an explicit duration assumption. It is not a
            published renewal date.
          </Notice>
        )}
        <Notice title="Forecasts, not confirmed tender dates" tone="info">
          Dates may shift with extensions, scope changes or procurement
          decisions.
        </Notice>
        <article className="forecast-row">
          <div>
            <Badge tone="warning">Inferred renewal</Badge>
            <h2>Analytics support contract</h2>
            <p>North Coast Council · historical supplier: Tern Digital</p>
          </div>
          <div>
            <small>Indicative window</small>
            <h3>Jan–Mar 2027</h3>
            <span className="muted">Timing unconfirmed</span>
          </div>
          <Button kind="secondary" onClick={() => setOpen(true)}>
            Inspect assumptions
          </Button>
        </article>
        <article className="forecast-row">
          <div>
            <Badge>Insufficient evidence</Badge>
            <h2>Customer research services</h2>
            <p>Southern Services Agency</p>
          </div>
          <div>
            <h3>Window unknown</h3>
            <span className="muted">
              Duration and extension terms unavailable
            </span>
          </div>
          <Button
            kind="text"
            onClick={() => go("agency", "normal", { id: "1" })}
          >
            Agency context
          </Button>
        </article>
      </StateBoundary>
      {open && (
        <Modal
          title="Why this window is inferred"
          onClose={() => setOpen(false)}
        >
          <KeyFacts
            items={[
              ["Historical award", "February 2022"],
              ["Assumed duration", "Five years · unconfirmed"],
              ["Estimated window", "January–March 2027"],
              ["Known extension options", "Not established"],
            ]}
          />
          <Notice title="Do not treat this as a contract end date">
            The source award does not confirm expiry or renewal. New source
            evidence should supersede this forecast.
          </Notice>
          <Button
            kind="text"
            onClick={() => {
              setOpen(false);
              go("awards");
            }}
          >
            Inspect the award record
          </Button>
        </Modal>
      )}
    </>
  );
}
