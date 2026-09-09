// Fictional, fixed examples for product review; no analytical engine runs here.
export const listingId = "HRC-2026-041";
export const incumbent = {
  public: "Current scope unconfirmed",
  rfp: "Aster · adjacent service only",
  evidence:
    "The agency supplier register lists Aster for platform support. It does not establish incumbency for transformation advisory.",
};
export const candidates = [
  {
    name: "Aster Consulting",
    id: "0",
    position: "Established agency relationship",
    discovery: "Captured agency supplier register · 8 Sep 2026",
    history:
      "Two related advisory awards corroborate experience; neither establishes the scope being re-tendered.",
    hypothesis:
      "Could compete through its existing agency relationship. The RFP separates platform support from this advisory procurement.",
    gap: "Bid intention and proposed team are unknown.",
    wins: "2",
    total: "NZ$1.8m",
    average: "NZ$900k",
  },
  {
    name: "Tern Digital",
    id: "1",
    position: "Relevant delivery specialist",
    discovery: "Captured supplier service page · 8 Sep 2026",
    history:
      "One related digital delivery award supports the capability described on its site.",
    hypothesis:
      "Its delivery experience is relevant. Evidence for independent advisory work is weaker.",
    gap: "Agency relationship and available capacity are unknown.",
    wins: "1",
    total: "NZ$600k",
    average: "NZ$600k",
  },
  {
    name: "Ridgeline Advisory",
    id: "2",
    position: "Plausible advisory challenger",
    discovery: "Captured supplier case study · 8 Sep 2026",
    history:
      "No matching award record found in the held snapshot. This does not establish a lack of capability.",
    hypothesis:
      "The published advisory case study fits the scope. Retain as a candidate with limited corroboration.",
    gap: "Public-sector references and bid intention need corroboration.",
    wins: "None found",
    total: "Not available",
    average: "Not available",
  },
];
export const assessmentChanges = [
  {
    topic: "Incumbent advantage",
    status: "Changed",
    before:
      "Aster’s agency relationship may extend to this procurement; current scope is unconfirmed.",
    after:
      "Aster supplies adjacent platform support. This procurement is a new, separate advisory package.",
    impact:
      "An agency relationship remains relevant, but a direct incumbent advantage is not established.",
    page: 4,
  },
  {
    topic: "Bundled platform delivery",
    status: "Retracted",
    before:
      "The public notice may combine advisory and platform delivery, creating a delivery-scale risk.",
    after:
      "Platform implementation is expressly excluded from the advisory contract.",
    impact:
      "The earlier bundling red flag no longer supports the recommendation.",
    page: 6,
  },
  {
    topic: "Evaluation criteria",
    status: "Added",
    before: "Evaluation weights are not published in the captured notice.",
    after: "Methodology 40%, team 30%, relevant experience 20%, price 10%.",
    impact:
      "A method and team-led response is more relevant than assumed scale or price advantage.",
    page: 9,
  },
  {
    topic: "Closing date",
    status: "Confirmed",
    before: "24 September 2026 · 5pm NZST, from notice revision 3.",
    after: "The uploaded RFP matches the current notice deadline.",
    impact: "The available response window is unchanged.",
    page: 2,
  },
];
export const recommendation = (rfp: boolean) =>
  rfp ? "Consider pursuing" : "Investigate before committing";
export const requestLabel = (kind?: string) =>
  kind === "Document assessment"
    ? "RFP reassessment"
    : kind === "Competitor profile"
      ? "Listing-specific competitor profile"
      : "Public-data pursuit";

export const awardRows = [
  [
    "Digital advisory services",
    "Harbour Regional Council",
    "Aster Consulting + Tern Digital",
    "2024",
    "NZ$1,200,000",
  ],
  [
    "Transformation advisory",
    "Southern Services Agency",
    "Aster Consulting",
    "2023",
    "NZ$1,000,000",
  ],
  [
    "Service strategy",
    "North Coast Council",
    "Aster Consulting",
    "2025",
    "NZ$800,000",
  ],
  [
    "Digital delivery support",
    "North Coast Council",
    "Tern Digital",
    "2025",
    "NZ$600,000",
  ],
];
