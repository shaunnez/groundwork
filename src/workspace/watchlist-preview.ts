import type { Opportunity, ReportSummary } from "./data";

export interface WatchlistPreview {
  deadline: string;
  summary: string;
  framing: string;
  basis: string;
  flags: string[];
  actions: [string, string, string];
  competitors: string[];
}

function excerpt(value: string | null | undefined): string {
  const clean =
    value
      ?.replace(/•/g, "; ")
      .replace(/([.!?])(?=[A-Z])/g, "$1 ")
      .replace(/(\d{4})(?=[A-Z])/g, "$1 ")
      .replace(/(What we need)(?=[A-Z])/gi, "$1: ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(
        /^Deadline to register for Briefing Session(?:\s+\d{1,2}){2}\s+\d{4}\s+Briefing Session(?:\s+\d{1,2}){2}\s+\d{4}\s*/i,
        "",
      ) || "";
  if (/^(?:no overview|not available|n\/?a|none)$/i.test(clean)) return "";
  if (clean.length <= 360) return clean;
  const sentences = [
    ...new Intl.Segmenter("en", { granularity: "sentence" }).segment(clean),
  ]
    .map((part) => part.segment.trim())
    .filter(Boolean);
  const first = sentences.slice(0, 2).join(" ");
  if (first.length <= 360 && first.length >= 80) return first;
  const end = clean.lastIndexOf(" ", 357);
  return clean.slice(0, end > 180 ? end : 357).trimEnd() + "…";
}

function isPlanningNotice(o: Opportunity): boolean {
  const kind = o.metadata.noticeType?.toLowerCase() || "";
  return /future procurement|^fpo\b|planning/.test(kind);
}

function isInformationRequest(o: Opportunity): boolean {
  const kind = o.metadata.noticeType?.toLowerCase() || "";
  return /\b(rfi|roi|eoi|noi)\b|request for information|registration of interest|expression of interest|notice of information|advance notice/.test(
    kind,
  );
}

function closingState(
  o: Opportunity,
  now: Date,
): "unknown" | "past" | "soon" | "later" {
  if (/\b(closed|cancelled|awarded)\b/i.test(o.metadata.status || ""))
    return "past";
  const stamp = o.metadata.closingAt;
  if (!stamp || Number.isNaN(Date.parse(stamp))) return "unknown";
  const remaining = Date.parse(stamp) - now.getTime();
  return remaining <= 0
    ? "past"
    : remaining <= 7 * 24 * 60 * 60 * 1000
      ? "soon"
      : "later";
}

function nzClosingDate(value: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Pacific/Auckland",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(value))
      .map(({ type, value }) => [type, value]),
  );
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}`;
}

export function watchlistPreview(
  opportunity: Opportunity,
  report?: Pick<ReportSummary, "verdict" | "summary" | "entities">,
  now = new Date(),
): WatchlistPreview {
  const planning = isPlanningNotice(opportunity);
  const information = isInformationRequest(opportunity);
  const closing = closingState(opportunity, now);
  const noGo = report?.verdict.recommendation === "NO-GO";
  const mentionsRevisedDeadline =
    /\b(revised|extended)\s+(?:the\s+)?deadline\b/i.test(
      report?.summary?.join(" ") || "",
    );
  const fromGets = opportunity.metadata.origin === "gets-intake";
  const briefingRegistration =
    /deadline to register for briefing session/i.test(
      opportunity.metadata.overview || "",
    );
  const overview = excerpt(opportunity.metadata.overview);
  const deadline =
    opportunity.metadata.closingAt &&
    !Number.isNaN(Date.parse(opportunity.metadata.closingAt))
      ? `Closed ${nzClosingDate(opportunity.metadata.closingAt)} NZ Time`
      : planning
        ? "Tender date not yet confirmed"
        : "Closing date not recorded";
  const summary =
    report?.summary?.[0] ||
    overview ||
    "The notice has no public overview in this workspace. Read the original notice to establish its scope.";
  const category = opportunity.metadata.category;
  const categoryLabel = category?.replace(/^\d{6,}\s*[-–:]\s*/, "").trim();
  const usefulCategory =
    categoryLabel &&
    categoryLabel !== "unspecified" &&
    !/united nations standard products and services code/i.test(categoryLabel);
  const framing =
    report?.summary?.[2] ||
    (!overview
      ? "The saved public listing does not establish scope, firm fit or commercial value; check the original notice before pursuing it."
      : planning
        ? "A planning signal for possible future work. Timing, scope and commercial value still need confirmation when a tender is published."
        : information
          ? /supplier register|pre-qualif|panel/i.test(
              opportunity.metadata.overview || "",
            )
            ? "A route to qualify for possible future work packages. Appointment or registration does not establish a contract value or guaranteed work."
            : "An early market-engagement or qualification stage. It does not yet establish a contract award or full bid invitation."
          : usefulCategory
            ? `Potential work in ${categoryLabel} for ${opportunity.buyer}. Assess the fit with your firm and the commercial value before committing bid effort.`
            : `Potential work for ${opportunity.buyer}. Assess the fit with your firm and the commercial value before committing bid effort.`);
  const flags: string[] = [];
  if (report?.summary?.[4]) flags.push(report.summary[4]);
  if (mentionsRevisedDeadline)
    flags.push(
      "The assessment refers to a revised deadline; confirm the latest date in the saved report and source notice.",
    );
  if (/\b(closed|cancelled|awarded)\b/i.test(opportunity.metadata.status || ""))
    flags.push(
      "The source notice is marked closed, cancelled or awarded; verify its current outcome before acting.",
    );
  else if (closing === "past" && !noGo)
    flags.push(
      "The recorded closing date has passed; check the notice for a change or award outcome.",
    );
  else if (closing === "soon" && !noGo)
    flags.push(
      "Closing within seven days; check whether there is enough time for a credible response.",
    );
  else if (closing === "unknown" && !report)
    flags.push(
      planning
        ? "No bidding deadline yet; this is a future opportunity, not a live tender."
        : "No verified closing date is stored; confirm it on the source notice.",
    );
  if (information && !report)
    flags.push(
      "This is an interest, information or advance-notice stage; a contract competition is not yet confirmed.",
    );
  if (briefingRegistration)
    flags.push(
      "A separate briefing registration date appears in the public overview; confirm it on GETS.",
    );
  if (!overview && !report)
    flags.push(
      "The public scope is missing from this record; read the source notice before assessing fit.",
    );
  if (fromGets) {
    if (
      !/\b(contract value|commercial value|budget|pricing)\b/i.test(
        report?.summary?.[4] || "",
      )
    )
      flags.push(
        "Contract value has not been independently checked; verify it in the tender documents.",
      );
    flags.push(
      "GETS intake did not check attachments or addenda; inspect the source pack.",
    );
  }

  const actions: [string, string, string] = noGo
    ? [
        report?.summary?.[3] ||
          "Read the saved no-bid assessment and its evidence.",
        "Confirm the no-bid reason against the latest notice and supporting evidence.",
        "Keep relevant buyer and supplier context for a future open opportunity.",
      ]
    : closing === "past"
      ? [
          "Check the source notice for an extension, award or cancellation.",
          "Review available documents to understand the buyer's scope and requirements.",
          "Record any relevant buyer or supplier intelligence for future opportunities.",
        ]
      : planning
        ? [
            "Save the notice and monitor for a live tender and confirmed dates.",
            "Check the public overview and any available supporting documents for the likely scope.",
            "Prepare relevant credentials and buyer research before a competition opens.",
          ]
        : information
          ? [
              "Check the notice and documents for registration, eligibility and response requirements.",
              briefingRegistration
                ? "Check the separate briefing registration and session dates as well as the notice close."
                : "Confirm the notice closing date, any registration deadline and briefing dates.",
              "Prepare relevant capability evidence and monitor for the next procurement stage.",
            ]
          : [
              report?.summary?.[3] ||
                "Read the full notice and any available documents to confirm scope and mandatory requirements.",
              briefingRegistration
                ? "Check briefing registration and session dates as well as the tender closing date."
                : closing === "unknown"
                  ? "Confirm the response deadline and question process on the source notice."
                  : "Check the response deadline, question process and time needed to prepare a credible submission.",
              "Test your firm's fit, likely delivery effort and commercial case before a bid decision.",
            ];
  const competitors =
    (noGo || closing === "past" ? [] : report?.entities)
      ?.filter((entity) => entity.name && entity.evidenceSourceIds?.length)
      .map((entity) => entity.name)
      .filter(
        (name) =>
          name.toLocaleLowerCase() !== opportunity.buyer.toLocaleLowerCase(),
      )
      .filter(
        (name, index, names) =>
          names.findIndex(
            (candidate) =>
              candidate.toLocaleLowerCase() === name.toLocaleLowerCase(),
          ) === index,
      )
      .slice(0, 3) || [];
  return {
    deadline,
    summary,
    framing,
    basis: report
      ? "Saved pursuit assessment · review the report for evidence and limits"
      : overview
        ? "Public notice overview · not yet assessed"
        : "Notice metadata only · not yet assessed",
    flags,
    actions,
    competitors,
  };
}
