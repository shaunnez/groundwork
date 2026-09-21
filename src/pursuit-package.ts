// Fictional analytical examples, selected by the report's evidence snapshot.
export const packageSections = [
  ["Executive summary", "0"],
  ["Opportunity & competition", "1"],
  ["Your firm", "2"],
  ["Centre of gravity", "gravity"],
  ["Strategic framing", "strategy"],
  ["Evaluation priorities", "evaluation"],
  ["Cone of plausibility", "cone"],
  ["Competing hypotheses", "hypotheses"],
  ["Risk register", "risks"],
  ["Gaps & next steps", "3"],
] as const;

export function pursuitPackage(rfp: boolean) {
  return {
    summary: rfp
      ? "The sample RFP defines a separate transformation advisory package, excluding platform implementation. This removes the earlier delivery-scale concern and creates a credible opening for a specialist firm. Methodology and team account for 70% of the disclosed evaluation; a focused approach and a demonstrably available team should lead the response."
      : "The public notice identifies transformation support, but leaves the advisory and platform-delivery boundary unresolved. The opportunity fits the firm’s stated experience; the missing scope and evaluation detail prevent a defensible commitment of bid effort. The immediate value is in resolving those uncertainties before building a response.",
    competitiveRead: rfp
      ? "Aster’s existing agency relationship may help it compete, but the RFP places its platform support outside this package. Tern and Ridgeline remain plausible challengers. No candidate’s bid intention, proposed team or price is confirmed."
      : "Aster’s supplier relationship is a relevant competitive signal, not proof of incumbency for this advisory work. Tern’s delivery experience and Ridgeline’s advisory case study warrant attention, with different gaps in corroboration. No bidder or likely winner is established.",
    decisionGate: rfp
      ? "Before committing: verify certification, references, named-team availability and a viable delivery estimate. A favourable market assessment does not establish firm eligibility."
      : "Before committing: obtain the RFP, establish scope and evaluation criteria, and check capacity. Tender-specific mandatory conditions and commercial viability remain unassessed.",
    gravity: {
      factor: rfp
        ? "A credible advisory method, delivered by a team the buyer can trust."
        : "Whether this is a specialist advisory package or a broader delivery commitment.",
      reasoning: rfp
        ? "The separate advisory scope reduces the relevance of platform delivery scale. Methodology and team carry the largest disclosed weights, making evidence of how the work will be delivered the strongest supported focus for a response. Agency familiarity still matters, but its influence cannot be quantified."
        : "That boundary determines the skills, partners, cost and mobilisation needed to compete. Aster’s adjacent platform relationship could matter more if delivery is bundled; the captured notice does not establish that it is. Treat scope as the decisive uncertainty rather than assume an incumbent-led outcome.",
      basis: rfp
        ? "Sample RFP v2 · scope pp. 4–6; evaluation p. 9."
        : "Captured notice v3 · incomplete scope; agency supplier register · adjacent platform support.",
      confidence: rfp
        ? "Moderate · interpretation of disclosed criteria"
        : "Limited · scope unresolved",
      implication: rfp
        ? "Invest in a practical work plan, named roles and comparable advisory evidence. Resolve eligibility and availability before approving the bid."
        : "Prioritise a scope clarification and an initial capacity check. Keep partnering options open until delivery obligations are known.",
      challenge: rfp
        ? "Revisit if an addendum changes the criteria or mandatory conditions, or if the proposed team cannot be secured."
        : "Revisit when the tender documents establish whether implementation is included and how proposals will be evaluated.",
    },
    scenarios: [
      {
        name: "Conservative",
        title: rfp ? "A difficult mobilisation" : "Broader delivery required",
        premise: rfp
          ? "The advisory scope is accessible, but certification, availability or delivery dependencies constrain the firm’s response."
          : "Advisory is bundled with implementation, requiring capacity or a partner beyond the firm’s current evidence.",
        signal: rfp
          ? "A team member is unavailable, certification is not current, or dependencies cannot be priced."
          : "Tender scope includes platform implementation, integration or substantial mobilisation obligations.",
        action: rfp
          ? "Hold commitment until gaps are resolved; reduce scope assumptions or decline if conditions cannot be met."
          : "Test a delivery partner and cost model before allocating a full bid team.",
      },
      {
        name: "Working case",
        title: rfp
          ? "A contest on method and team"
          : "Advisory-led competition",
        premise: rfp
          ? "The disclosed criteria reward a practical advisory approach and a credible team. Several relevant suppliers could respond."
          : "The notice’s advisory focus may allow a specialist response, while the precise delivery boundary remains open.",
        signal: rfp
          ? "Scope and criteria remain unchanged; the firm can evidence its proposed people and approach."
          : "The RFP separates advisory deliverables and discloses requirements the firm can evidence.",
        action: rfp
          ? "Prepare a method-led response, supported by named roles and verified references."
          : "Prepare relevant programme examples and request the documents needed to test this case.",
      },
      {
        name: "Optimistic",
        title: rfp
          ? "A distinctive specialist response"
          : "A clear specialist opening",
        premise: rfp
          ? "The firm’s references and available team provide a particularly strong fit to the advisory work. Competitor weaknesses remain unverified."
          : "The eventual scope aligns closely with specialist advice and the firm can substantiate the required capability.",
        signal: rfp
          ? "References validate comparable outcomes and the full proposed team confirms availability."
          : "Published scope, criteria and mandatory conditions support an independently deliverable specialist package.",
        action: rfp
          ? "Demonstrate specific outcomes and delivery confidence; retain commercial and eligibility checks."
          : "Develop differentiation once the scope is confirmed; do not treat this upside case as a forecast.",
      },
    ],
    hypotheses: [
      {
        id: "H1",
        title: "Agency familiarity gives Aster the strongest position",
        supporting:
          "The captured supplier register shows an agency relationship; two related awards corroborate experience.",
        against: rfp
          ? "The RFP identifies adjacent platform support and a new advisory package. Direct incumbency and automatic carry-over advantage are not established."
          : "The register covers platform support. Neither the notice nor the award sample establishes incumbency for this advisory scope.",
        judgement: rfp ? "Weakened after RFP" : "Plausible · limited support",
        test: "Confirm the exact prior scope and any transition dependencies. Do not infer an intention to bid from a supplier relationship.",
      },
      {
        id: "H2",
        title:
          "A specialist advisory challenger can compete on method and team",
        supporting: rfp
          ? "The sample RFP excludes implementation and gives methodology 40% and team 30%. Ridgeline’s case study and firm-supplied references illustrate relevant capability signals."
          : "The notice describes transformation support. Advisory case studies and firm-supplied examples suggest a potentially relevant specialist capability.",
        against:
          "References, available people and bid intentions are not fully corroborated. Capability signals alone do not establish a superior response.",
        judgement: rfp
          ? "Best supported working explanation"
          : "Open · needs scope evidence",
        test: rfp
          ? "Validate reference relevance and team availability against the disclosed criteria."
          : "Obtain scope and evaluation criteria before elevating this explanation.",
      },
      {
        id: "H3",
        title: "Bundled implementation favours a larger delivery supplier",
        supporting: rfp
          ? "The earlier public notice left the delivery boundary open. That ambiguity was the original basis for this hypothesis."
          : "The notice leaves the delivery boundary open; Tern has a corroborated digital-delivery award.",
        against: rfp
          ? "RFP v2, page 6 expressly excludes platform implementation. The central premise is contradicted by the supplied scope."
          : "An unclear scope is not evidence that implementation is required. The notice does not confirm a bundled package.",
        judgement: rfp
          ? "Retracted · contradicted by RFP"
          : "Unresolved · weak support",
        test: rfp
          ? "Keep the earlier reasoning in the public-data version; reopen only if a later addendum changes scope."
          : "Check the RFP’s scope exclusions and delivery responsibilities.",
      },
    ],
  };
}
