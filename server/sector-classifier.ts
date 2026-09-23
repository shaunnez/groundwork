export type SectorEvidence = {
  sector: string;
  field: "title" | "GETS category" | "overview";
  match: string;
};

type Rule = { sector: string; pattern: RegExp };

// Specific scope in the title takes precedence over the often broad UNSPSC
// category. These rules are intentionally versioned with the caller.
const titleRules: Rule[] = [
  {
    sector: "Public funding and partnerships",
    pattern: /\b(fund(?:ing)?|grant|partnership opportunity)\b/i,
  },
  {
    sector: "Goods and equipment",
    pattern:
      /\b(signage|weather radar|heavy & industrial MHE|tender for sale|sale of surplus|radar system|supply, installation and commissioning)\b/i,
  },
  {
    sector: "Education and training",
    pattern:
      /\b(road safety education|safeguarding training|simulated participants for clinical education)\b/i,
  },
  {
    sector: "Professional and business services",
    pattern:
      /\b(professional services|investment and delivery plan|external print|testing professional services|forecasting tools|monitoring & investigation services)\b/i,
  },
  {
    sector: "Environment and land",
    pattern:
      /\b(estuary|asbestos-related|park recreational development|inlet remediation)\b/i,
  },
  {
    sector: "Water and utilities",
    pattern:
      /\b(wastewater|stormwater|sewer(?:age)?|watermain|water main|drinking water|raw water|water supply|water treatment|water network|three waters|3 waters|floodwall|flood protection|water pipe|pipeline renewals|water trunk|water reticulation|water services|groundwater|water technical|WWTP|WTP|rider main)\b/i,
  },
  {
    sector: "Energy and electricity",
    pattern:
      /\b(electricity|power purchasing|power generation|energy supply|energy-related|solar|circuit breakers?|substation|grid flexibility|streetlight|lighting pole|ring main unit)\b/i,
  },
  {
    sector: "Civil and transport infrastructure",
    pattern:
      /\b(bridge|road(?:ing)?|highway|pavement|footpath|kerb|runway|dredging|harbour works|wharf|walkway|cycleway|signalisation|ferry terminal|airport extension|erosion mitigation|civil works|slip remediation|flood resilience|subsoil drainage|track upgrade|boardwalk|roundabout|flume construction)\b/i,
  },
  {
    sector: "Buildings and facilities",
    pattern:
      /\b(building|housing|roof(?:ing)?|cladding|refurbish(?:ment)?|toilet(?: block)?|plant room|lift (?:maintenance|replacement)|window replacement|school (?:works|upgrade)|seismic strengthening|facility maintenance|fitout|fit-out|chiller replacement|heating|HVAC|air conditioning|fencing|sportsgrounds|playground renewal|courts renewal|construction contractor|demolition|door replacement|air dome|arena|pool structure|shade structure|floor upgrade|cleaning contract|building cleaning)\b/i,
  },
  {
    sector: "Digital and telecommunications",
    pattern:
      /\b(software|digital|ICT|IT managed|ERP|HRIS|SAP|cyber|cloud|data steward(?:ship)?|data centre|information technology|telecommunication|online platform|WAF managed|system integrator|computer services|technology solution|technology services|application development|scheduling solution|relay service|dispatch technology|observability|meeting room modernisation)\b/i,
  },
  {
    sector: "Health and care",
    pattern:
      /\b(healthcare|health services|mental health|surgery|clinical|patient|disability care|disabled people|care and support|imaging services|oncology services|counselling|drug testing|medical services|forensic report writer|employee assistance programme|reducing the incidence and severity of injuries)\b/i,
  },
  {
    sector: "Education and training",
    pattern:
      /\b(training|education programme|teaching|learning programme|curriculum|professional development|skill development|PLD panel|road safety education|simulated participants|educational resources)\b/i,
  },
  {
    sector: "Environment and land",
    pattern:
      /\b(biodiversity|pest control|wilding|landfill|ecolog(?:y|ical)|environmental|conservation|forestry|tree maintenance|wetland|coastal restoration|waste and recycling|waste collection|landscape maintenance|biosecurity|invasive species|manchurian rice|blue-green|inlet remediation|natural hazard|river[s]? & coastal)\b/i,
  },
  {
    sector: "Transport services and logistics",
    pattern:
      /\b(bus services|passenger transport|transport services|ferry operator|fleet maintenance|towing services|logistics|freight|travel management|office relocation|material handling|rail services|parking (?:management|as a service)|print \(and associated services\))\b/i,
  },
  {
    sector: "Security and emergency services",
    pattern:
      /\b(security services|criminal history|police services|CCTV|emergency management|defence|RPAS|appliances \(2WD|safety team|fire and emergency)\b/i,
  },
  {
    sector: "Professional and business services",
    pattern:
      /\b(consult(?:ant|ancy|ing)|audit|legal services|feasibility study|asset management review|quantity survey|project management (?:\(PM\) )?panel|business analysis|research services|banking services|payroll services|property management|planning services|communications services|psychometric testing|cognitive ability testing)\b/i,
  },
  {
    sector: "Goods and equipment",
    pattern:
      /\b(supply of|equipment|consumables|vaporisers|meters|vehicles|spares|trolleys|musical instruments|music kits|laboratory|mass spectrometer|machinery|circuit breakers|vessel renewal|uniforms|signage)\b/i,
  },
];

const categoryRules: Rule[] = [
  {
    sector: "Civil and transport infrastructure",
    pattern: /^(7214|3012|811022)\d{4} - /,
  },
  { sector: "Buildings and facilities", pattern: /^(72|9512)\d{4,6} - / },
  { sector: "Civil and transport infrastructure", pattern: /^9511\d{4} - / },
  { sector: "Water and utilities", pattern: /^(8310|4710|7017)\d{4} - / },
  { sector: "Energy and electricity", pattern: /^(2611|2612|831018)\d{2} - / },
  {
    sector: "Digital and telecommunications",
    pattern: /^(43|8111|8116|8311)\d{6} - /,
  },
  { sector: "Health and care", pattern: /^(85|42)\d{6} - / },
  { sector: "Education and training", pattern: /^(86|60)\d{6} - / },
  { sector: "Environment and land", pattern: /^(70|77|76)\d{6} - / },
  { sector: "Transport services and logistics", pattern: /^78\d{6} - / },
  { sector: "Security and emergency services", pattern: /^(46|92)\d{6} - / },
  {
    sector: "Professional and business services",
    pattern: /^(80|81|84)\d{6} - /,
  },
  {
    sector: "Goods and equipment",
    pattern: /^(22|23|24|25|30|31|39|40|41|47|48|49|51|55|60)\d{6} - /,
  },
];

function unique(matches: SectorEvidence[]): SectorEvidence | null {
  return new Set(matches.map((match) => match.sector)).size === 1
    ? matches[0]
    : null;
}

export function classifySavedOpportunity(input: {
  title: string;
  overview?: string | null;
  getsCategories?: string[];
  availableSectors: string[];
}): SectorEvidence | null {
  const available = new Set(input.availableSectors);
  const titleMatches = titleRules.flatMap(({ sector, pattern }) => {
    const match = input.title.match(pattern);
    return match && available.has(sector)
      ? [{ sector, field: "title" as const, match: match[0] }]
      : [];
  });
  // The ordering resolves generic terms such as "main contractor" in a bridge
  // job using the more specific scope word first.
  const title = titleMatches[0] ?? null;
  const categories = (input.getsCategories ?? []).flatMap((category) => {
    const rule = categoryRules.find(
      ({ sector, pattern }) => pattern.test(category) && available.has(sector),
    );
    return rule
      ? [
          {
            sector: rule.sector,
            field: "GETS category" as const,
            match: category,
          },
        ]
      : [];
  });
  const category = unique(categories);
  if (title) return title;
  if (category) return category;
  const overviewMatches = titleRules.flatMap(({ sector, pattern }) => {
    const match = input.overview?.match(pattern);
    return match && available.has(sector)
      ? [{ sector, field: "overview" as const, match: match[0] }]
      : [];
  });
  return unique(
    overviewMatches.filter(
      ({ match }) => !/^(road|building|equipment|services)$/i.test(match),
    ),
  );
}
