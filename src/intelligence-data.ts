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

export type WatchAssessment = {
  basis: string;
  summary: string[];
  actions: string[];
};

export function watchAssessment(title: string, rfp = false): WatchAssessment {
  if (title === "Digital service transformation")
    return {
      basis: rfp
        ? "RFP reassessment · sample"
        : "Public-data assessment · provisional",
      summary: rfp
        ? [
            "The separate advisory scope gives a specialist firm a clearer route to compete; platform implementation is excluded.",
            "Aster’s adjacent agency relationship remains relevant, but direct incumbency is not established. Firm eligibility and capacity still need review.",
          ]
        : [
            "Advisory fit is promising, but possible platform delivery makes the required team and delivery scale uncertain.",
            "Aster has an agency relationship; Tern and Ridgeline are plausible competitors. Bid intentions and direct incumbency are unconfirmed.",
          ],
      actions: rfp
        ? [
            "Build the response around methodology and the named team; together they carry 70% in the sample RFP.",
            "Confirm certification, references and team availability before committing.",
          ]
        : [
            "Obtain the RFP to establish scope and evaluation criteria, then reassess.",
            "Use the extended deadline to check team capacity and supporting evidence.",
          ],
    };
  const limited: Record<string, WatchAssessment> = {
    "Customer experience research": {
      basis: "Notice only · suggested checks",
      summary: [
        "Research work may be relevant to a service-design team. Required methods, scale and buyer priorities have not been assessed.",
      ],
      actions: [
        "Read the tender scope and test the required research methods against your references before shortlisting.",
      ],
    },
    "Data governance advisory": {
      basis: "Analysis pending · suggested checks",
      summary: [
        "The advisory category is relevant, but analysis is queued. There is no completed assessment of competitors, incumbent or mandatory conditions.",
      ],
      actions: [
        "Review the notice while enrichment is pending; confirm specialist capability and revisit when the assessment is ready.",
      ],
    },
    "Programme assurance panel": {
      basis: "Notice only · suggested checks",
      summary: [
        "The panel may offer a route to future assurance work. Appointment alone would not establish a guaranteed volume of work; call-off terms remain unchecked.",
      ],
      actions: [
        "Check panel entry conditions and how work is allocated, then match your assurance references to the scope.",
      ],
    },
    "Service design panel": {
      basis: "Planning signal · suggested preparation",
      summary: [
        "Potential future demand gives time to prepare relevant evidence. This is an indicative plan, not an open tender or confirmed revenue.",
      ],
      actions: [
        "Save the signal and prepare service-design references; check for a published notice before allocating bid effort.",
      ],
    },
  };
  return (
    limited[title] || {
      basis: "Not assessed",
      summary: ["No assessment is available for this opportunity."],
      actions: [
        "Review the source notice before deciding whether to investigate.",
      ],
    }
  );
}

// More detail for both the pursuit workspace and its versioned report.
// Public-data versions must not acquire facts available only in the RFP.
export function pursuitDetail(rfp: boolean) {
  return {
    strategy: rfp
      ? "Position the firm around independent advice, a practical methodology and a named specialist team. The RFP separates advisory from platform implementation, so platform delivery scale is not a supported differentiator for this package."
      : "Test whether the opportunity rewards specialist advice or requires a broader delivery team. Prepare relevant transformation examples, but defer a detailed response strategy until the scope and evaluation criteria are available.",
    strategyBasis: rfp
      ? "Sample RFP v2 · scope pp. 4–6; evaluation p. 9."
      : "Captured public notice v3 and firm-supplied capability statement. Strategic interpretation remains provisional.",
    criteria: rfp
      ? [
          {
            name: "Methodology",
            weight: "40%",
            response:
              "Explain the proposed approach, stages, outputs and how the buyer can test their usefulness.",
          },
          {
            name: "Team",
            weight: "30%",
            response:
              "Name the delivery team, show relevant roles and confirm availability.",
          },
          {
            name: "Relevant experience",
            weight: "20%",
            response:
              "Map the two firm-supplied programme examples to the advisory scope; validate references.",
          },
          {
            name: "Price",
            weight: "10%",
            response:
              "Set out scope assumptions and a transparent fee basis. No budget or competitor price is established.",
          },
        ]
      : [],
    risks: [
      {
        title: "Scope and delivery commitment",
        detail: rfp
          ? "Platform implementation is excluded. The earlier bundling concern is retracted; confirm remaining deliverables and dependencies in the supplied documents."
          : "The notice does not resolve advisory versus platform delivery. A response could understate the delivery team or commercial commitment.",
        basis: rfp
          ? "Sample RFP v2 · pp. 4–6"
          : "Captured public notice v3 · scope incomplete",
      },
      {
        title: "Eligibility and resourcing",
        detail: rfp
          ? "The sample RFP requires current security certification. Confirm the firm’s evidence and team capacity; a favourable recommendation does not complete these checks."
          : "Firm certification and team availability need checking. Tender-specific mandatory conditions are not established by this public-data version.",
        basis: rfp
          ? "Sample RFP v2 · p. 12; firm evidence needs review"
          : "Firm-supplied context; tender conditions unavailable",
      },
      {
        title: "Commercial uncertainty",
        detail:
          "Contract value, cost to bid and achievable margin are not established. Confirm a delivery estimate and the commercial terms before approving bid effort.",
        basis:
          "Value undisclosed in the sample; no cost or margin model supplied",
      },
      {
        title: "Competitive uncertainty",
        detail:
          "Candidate firms have relevant signals, but no confirmed bid intention or proposed team. Agency familiarity alone does not prove a decisive advantage.",
        basis: "Captured supplier sources and limited held award records",
      },
    ],
  };
}

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
