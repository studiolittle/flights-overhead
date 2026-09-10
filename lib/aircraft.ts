// Decoding helpers for the fields OpenSky exposes on a state vector.
// OpenSky removed its aircraft-metadata endpoint (410 Gone), so registration
// and airframe model are not available. Everything here is derived from the
// callsign and the ADS-B enumerations.

/**
 * ICAO three-letter airline designators. Weighted toward carriers that
 * actually show up over Canada, plus the major international operators.
 */
const AIRLINES: Record<string, string> = {
  // Canada
  ACA: "Air Canada",
  JZA: "Air Canada Express (Jazz)",
  ROU: "Air Canada Rouge",
  WJA: "WestJet",
  WEN: "WestJet Encore",
  WSW: "WestJet (Swoop)",
  TSC: "Air Transat",
  POE: "Porter Airlines",
  FLE: "Flair Airlines",
  SWG: "Sunwing",
  CJT: "Cargojet",
  MAL: "Morningstar Air Express",
  PAG: "Perimeter Aviation",
  CDN: "Canadian North",
  FAB: "First Air",
  KFA: "Kelowna Flightcraft",
  // United States
  AAL: "American Airlines",
  UAL: "United Airlines",
  DAL: "Delta Air Lines",
  SWA: "Southwest Airlines",
  JBU: "JetBlue",
  ASA: "Alaska Airlines",
  NKS: "Spirit Airlines",
  FFT: "Frontier Airlines",
  HAL: "Hawaiian Airlines",
  SKW: "SkyWest",
  RPA: "Republic Airways",
  EDV: "Endeavor Air",
  ENY: "Envoy Air",
  PDT: "Piedmont Airlines",
  JIA: "PSA Airlines",
  QXE: "Horizon Air",
  AAY: "Allegiant Air",
  SCX: "Sun Country",
  // Cargo
  UPS: "UPS Airlines",
  FDX: "FedEx Express",
  GTI: "Atlas Air",
  ABX: "ABX Air",
  CKS: "Kalitta Air",
  ATN: "Air Transport International",
  GEC: "Lufthansa Cargo",
  CLX: "Cargolux",
  // Europe
  BAW: "British Airways",
  VIR: "Virgin Atlantic",
  AFR: "Air France",
  DLH: "Lufthansa",
  KLM: "KLM",
  SWR: "Swiss",
  AUA: "Austrian Airlines",
  IBE: "Iberia",
  TAP: "TAP Air Portugal",
  SAS: "SAS",
  FIN: "Finnair",
  ITY: "ITA Airways",
  EIN: "Aer Lingus",
  RYR: "Ryanair",
  EZY: "easyJet",
  WZZ: "Wizz Air",
  VLG: "Vueling",
  NAX: "Norwegian",
  ICE: "Icelandair",
  LOT: "LOT Polish Airlines",
  CSA: "Czech Airlines",
  AEE: "Aegean Airlines",
  TVS: "Smartwings",
  TUI: "TUI Airways",
  CFG: "Condor",
  EWG: "Eurowings",
  SXS: "SunExpress",
  PGT: "Pegasus Airlines",
  BEL: "Brussels Airlines",
  TRA: "Transavia",
  // Middle East / Africa / Central Asia
  UAE: "Emirates",
  QTR: "Qatar Airways",
  ETD: "Etihad Airways",
  THY: "Turkish Airlines",
  ELY: "El Al",
  SVA: "Saudia",
  MSR: "EgyptAir",
  RAM: "Royal Air Maroc",
  ETH: "Ethiopian Airlines",
  SAA: "South African Airways",
  KQA: "Kenya Airways",
  RJA: "Royal Jordanian",
  MEA: "Middle East Airlines",
  GFA: "Gulf Air",
  KAC: "Kuwait Airways",
  OMA: "Oman Air",
  ABY: "Air Arabia",
  FDB: "flydubai",
  KZR: "Air Astana",
  AFL: "Aeroflot",
  // Asia / Pacific
  ANA: "All Nippon Airways",
  JAL: "Japan Airlines",
  KAL: "Korean Air",
  AAR: "Asiana Airlines",
  CCA: "Air China",
  CES: "China Eastern",
  CSN: "China Southern",
  CPA: "Cathay Pacific",
  SIA: "Singapore Airlines",
  THA: "Thai Airways",
  MAS: "Malaysia Airlines",
  GIA: "Garuda Indonesia",
  PAL: "Philippine Airlines",
  HVN: "Vietnam Airlines",
  VJC: "VietJet Air",
  AIC: "Air India",
  IGO: "IndiGo",
  PIA: "Pakistan International",
  UBG: "U.S.-Bangla",
  QFA: "Qantas",
  ANZ: "Air New Zealand",
  VOZ: "Virgin Australia",
  // Latin America
  AMX: "Aeroméxico",
  VOI: "Volaris",
  CMP: "Copa Airlines",
  AVA: "Avianca",
  LAN: "LATAM Airlines",
  TAM: "LATAM Brasil",
  GLO: "Gol",
  AZU: "Azul",
  ARG: "Aerolíneas Argentinas",
  CUB: "Cubana",
};

/** ADS-B emitter category (state vector index 17). */
const CATEGORIES: Record<number, string> = {
  0: "No information",
  1: "No ADS-B category",
  2: "Light (under 15,500 lb)",
  3: "Small (15,500-75,000 lb)",
  4: "Large (75,000-300,000 lb)",
  5: "High-vortex large",
  6: "Heavy (over 300,000 lb)",
  7: "High performance",
  8: "Rotorcraft",
  9: "Glider / sailplane",
  10: "Lighter-than-air",
  11: "Parachutist",
  12: "Ultralight / paraglider",
  13: "Reserved",
  14: "Unmanned aerial vehicle",
  15: "Space vehicle",
  16: "Emergency vehicle",
  17: "Service vehicle",
  18: "Point obstacle",
  19: "Cluster obstacle",
  20: "Line obstacle",
};

/** ADS-B position source (state vector index 16). */
const POSITION_SOURCES: Record<number, string> = {
  0: "ADS-B",
  1: "ASTERIX",
  2: "MLAT",
  3: "FLARM",
};

const SQUAWKS: Record<string, { label: string; emergency: boolean }> = {
  "7500": { label: "Unlawful interference", emergency: true },
  "7600": { label: "Radio failure", emergency: true },
  "7700": { label: "General emergency", emergency: true },
  "1200": { label: "VFR (North America)", emergency: false },
  "7000": { label: "VFR (Europe)", emergency: false },
  "2000": { label: "Uncontrolled airspace", emergency: false },
};

/** Callsigns that are really a tail number, e.g. CFBEL, N412RG, GEUZH. */
const REGISTRATION_RE = /^(?:[CN]|G|D|F|VH|ZK|PH|OE|LN|SE|EI|HB)[A-Z0-9]{3,5}$/;

export interface CallsignInfo {
  /** Operator name when the prefix is a known airline. */
  operator: string | null;
  /** Flight number portion, e.g. "742". */
  flightNumber: string | null;
  /** Human label, e.g. "Air Canada 742" or "Private / general aviation". */
  label: string;
  isRegistration: boolean;
}

export function decodeCallsign(raw: string): CallsignInfo {
  const cs = raw.trim().toUpperCase();

  if (!cs || cs === "UNKNOWN") {
    return {
      operator: null,
      flightNumber: null,
      label: "No callsign broadcast",
      isRegistration: false,
    };
  }

  const airlineMatch = cs.match(/^([A-Z]{3})(\d[A-Z0-9]*)$/);
  if (airlineMatch) {
    const [, prefix, number] = airlineMatch;
    const operator = AIRLINES[prefix] ?? null;
    return {
      operator,
      flightNumber: number,
      label: operator ? `${operator} ${number}` : `${prefix} ${number}`,
      isRegistration: false,
    };
  }

  if (REGISTRATION_RE.test(cs)) {
    return {
      operator: null,
      flightNumber: null,
      label: "Private / general aviation",
      isRegistration: true,
    };
  }

  return {
    operator: null,
    flightNumber: null,
    label: cs,
    isRegistration: false,
  };
}

export function categoryLabel(category: number | null): string | null {
  if (category == null) return null;
  const label = CATEGORIES[category];
  if (!label || category === 0 || category === 1 || category === 13) return null;
  return label;
}

export function positionSourceLabel(source: number | null): string {
  if (source == null) return "--";
  return POSITION_SOURCES[source] ?? `Source ${source}`;
}

export function squawkInfo(
  squawk: string | null,
): { label: string; emergency: boolean } | null {
  if (!squawk) return null;
  return SQUAWKS[squawk] ?? null;
}
