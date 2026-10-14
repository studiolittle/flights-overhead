// Decoding helpers for the raw ADS-B fields: turning a callsign into an
// operator and a flight number, and the coded enumerations into words.

import { factsFor } from "./facts";
import type { Contact } from "./types";

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

/** ADS-B emitter category, as the letter-digit codes the feed reports. */
const CATEGORIES: Record<string, string> = {
  A1: "Light (under 15,500 lb)",
  A2: "Small (15,500-75,000 lb)",
  A3: "Large (75,000-300,000 lb)",
  A4: "High-vortex large",
  A5: "Heavy (over 300,000 lb)",
  A6: "High performance",
  A7: "Rotorcraft",
  B1: "Glider / sailplane",
  B2: "Lighter-than-air",
  B3: "Parachutist",
  B4: "Ultralight / paraglider",
  B6: "Unmanned aerial vehicle",
  B7: "Space vehicle",
  C1: "Surface vehicle (emergency)",
  C2: "Surface vehicle (service)",
  C3: "Point obstacle",
  C4: "Cluster obstacle",
  C5: "Line obstacle",
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

export function categoryLabel(category: string | null): string | null {
  if (!category) return null;
  // A0/B0/C0 mean "no information", so there is nothing worth showing.
  return CATEGORIES[category.toUpperCase()] ?? null;
}

/**
 * The flight the way a person would say it, e.g. "Air Canada 461". The
 * curated designator table wins: adsbdb occasionally maps a prefix to a
 * different carrier that shares it (ROU comes back as a Chilean airline).
 */
export function flightTitle(c: Contact): string {
  const cs = decodeCallsign(c.callsign);
  const e = c.enrichment;
  const operator = cs.operator ?? e?.airlineName ?? e?.owner ?? null;
  return operator && cs.flightNumber ? `${operator} ${cs.flightNumber}` : cs.label;
}

/**
 * A helicopter: the transponder's emitter category says rotorcraft (A7), or
 * the aircraft type is one the facts table lists as a helicopter. The type
 * check catches the many helicopters that broadcast no category.
 */
export function isRotorcraft(c: Contact): boolean {
  if (c.category?.toUpperCase() === "A7") return true;
  const f = factsFor(c.enrichment?.icaoType);
  return f != null && /helicopter/i.test(f.category);
}

/** The silhouette the radar draws for an aircraft. */
export type AircraftShape =
  | "light"
  | "turboprop"
  | "rearjet"
  | "narrowbody"
  | "widebody"
  | "quad"
  | "quadprop"
  | "helicopter";

/**
 * ICAO type designators by silhouette, checked in order. Four engines first,
 * then widebodies, so a 747 never reads as a twin; rear-engined jets before
 * the light singles, because Citation codes (C25A, C560) share a prefix with
 * Cessna singles (C172, C208).
 */
const SHAPE_BY_TYPE: [AircraftShape, RegExp][] = [
  ["quadprop", /^(C130|C30J|A400|AN12|AN22|L188|P3)$/],
  ["quad", /^(B74\w|VC25|A34\d|A38\d|A124|C17|C5M?|K35R|C135|E3\w|E6|IL76)$/],
  ["widebody", /^(A30\w|A310|A33\d|A35\w|B76\d|B77\w|B78\w|MD11|DC10|L101|IL96|KC10)$/],
  ["rearjet", /^(CRJ\w|CL\d\d|GLEX|GL\dT|GLF\d|GA\dC|C25\w|C5[0-6]\w|C510|C68\w|C700|C750|E5[045]\w|E545|E550|LJ\d\d|H25\w|FA\w\w|F2TH|F900|F20|BE40|PRM1|HDJT|EA50|PC24|B712|MD8\d|MD90|DC9\w?|F100|F70|GALX|ASTR|WW24|ALJT|T-?33)$/],
  ["narrowbody", /^(A31[89]|A32\w|A19N|A20N|A21N|B73\w|B3\dM|B75\d|C32|C40|BCS\d|E17\d|E19\d|E75\w|E29\d|A22\d|C919|SU95|B72\d)$/],
  ["turboprop", /^(DH8\w|AT[4-7]\w|DHC6|DHC7|DH7|B350|BE20|BE30|BE9\w|B190|BE1\d|D228|D328|SW\d|JS\d\d|SF34|CN35|C295|CV58|E120|SB20|AN2[46]|PA31|PA34|PA44|PA60|C310|C340|C402|C404|C414|C421|BE55|BE58|BE76|DA42|DA62|P68|L410)$/],
  ["light", /^(C1\d\d|C2[0-1]\d|C206|C208|PA\d\d\w?|P28\w|SR2\d|S22T|DA20|DA40|BE3\d|BE23|M20\w|PC12|PC6|PC21|TBM\w|KODI|DHC2|DHC3|AA5|RV\w*|GLID|ULAC|CH\d\d|DV20|AC11)$/],
];

/**
 * Which silhouette to draw: the aircraft type when the feed names one, then
 * the facts table's category, then the transponder's emitter size class
 * (A1 light, A2 small, A3 large, A4 757, A5 heavy, A6 fast, A7 rotorcraft).
 * Falls back to an airliner, the commonest thing over YOW.
 */
export function aircraftShape(c: Contact): AircraftShape {
  if (isRotorcraft(c)) return "helicopter";
  const type = c.enrichment?.icaoType?.toUpperCase() ?? null;
  if (type) {
    for (const [shape, re] of SHAPE_BY_TYPE) if (re.test(type)) return shape;
  }
  const cat = factsFor(type)?.category ?? "";
  if (/widebody|heavy/i.test(cat)) return "widebody";
  if (/narrowbody|head-of-state/i.test(cat)) return "narrowbody";
  if (/jet/i.test(cat)) return "rearjet";
  if (/turboprop|military transport/i.test(cat)) return "turboprop";
  if (/GA|bush|trainer|homebuilt/.test(cat)) return "light";
  switch (c.category?.toUpperCase()) {
    case "A1":
    case "B1":
    case "B4":
    case "B6":
      return "light";
    case "A2":
      return "turboprop";
    case "A5":
      return "widebody";
    case "A6":
      return "rearjet";
    default:
      return "narrowbody";
  }
}

export function squawkInfo(
  squawk: string | null,
): { label: string; emergency: boolean } | null {
  if (!squawk) return null;
  return SQUAWKS[squawk] ?? null;
}
