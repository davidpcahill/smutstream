// Curated streaming radio stations — all ad-free, listener-supported, 24/7.
// SomaFM URLs follow https://ice1.somafm.com/{slug}-128-mp3
// Radio Paradise URLs from https://radioparadise.com/listen/stream-links
export type Station = {
  key: string;
  name: string;
  blurb: string;
  url: string;
  category: StationCategory;
};

export type StationCategory =
  | "chill"
  | "party"
  | "ambient"
  | "rock"
  | "retro"
  | "country"
  | "eclectic"
  | "jazz";

const CATEGORY_ORDER: StationCategory[] = [
  "chill",
  "ambient",
  "party",
  "rock",
  "retro",
  "country",
  "eclectic",
  "jazz",
];

export const CATEGORY_LABELS: Record<StationCategory, string> = {
  chill: "chill / lounge",
  ambient: "ambient / space",
  party: "party / electronic",
  rock: "rock / indie / metal",
  retro: "retro / 80s / oldies",
  country: "country / folk / world-trad",
  eclectic: "eclectic (Radio Paradise)",
  jazz: "jazz",
};

const soma = (slug: string) => `https://ice1.somafm.com/${slug}-128-mp3`;

export const STATIONS: Station[] = [
  // chill / lounge
  { key: "groovesalad",         category: "chill", name: "Groove Salad",       blurb: "the original chilled ambient + downtempo", url: soma("groovesalad") },
  { key: "groovesaladclassic",  category: "chill", name: "Groove Salad Classic", blurb: "earlier era of Groove Salad", url: soma("gsclassic") },
  { key: "lush",                category: "chill", name: "Lush",                blurb: "smooth vocal trance + electronica", url: soma("lush") },
  { key: "bossa",               category: "chill", name: "Bossa Beyond",        blurb: "bossa nova + samba lounge", url: soma("bossa") },
  { key: "digitalis",           category: "chill", name: "Digitalis",           blurb: "indie chillout + folktronica", url: soma("digitalis") },
  { key: "fluid",               category: "chill", name: "Fluid",               blurb: "instrumental hip-hop + chillhop", url: soma("fluid") },

  // ambient / space
  { key: "deepspaceone",        category: "ambient", name: "Deep Space One",    blurb: "deep ambient electronic + space music", url: soma("deepspaceone") },
  { key: "dronezone",           category: "ambient", name: "Drone Zone",        blurb: "atmospheric drone — set and forget", url: soma("dronezone") },
  { key: "missioncontrol",      category: "ambient", name: "Mission Control",   blurb: "Apollo audio mixed with downtempo", url: soma("missioncontrol") },
  { key: "doomed",              category: "ambient", name: "Doomed",            blurb: "gothic dark ambient (mood music)", url: soma("doomed") },

  // party / electronic
  { key: "beatblender",         category: "party", name: "Beat Blender",       blurb: "deep mix of laid-back electronica", url: soma("beatblender") },
  { key: "thetrip",             category: "party", name: "The Trip",            blurb: "progressive house + trance, peak hour vibes", url: soma("thetrip") },
  { key: "defcon",              category: "party", name: "DEF CON Radio",       blurb: "hacker conference soundtrack — synthwave + electro", url: soma("defcon") },
  { key: "darkzone",            category: "party", name: "Dark Zone",           blurb: "dark dance + industrial", url: soma("darkzone") },
  { key: "suburbsofgoa",        category: "party", name: "Suburbs of Goa",      blurb: "psy-trance + global dance fusion", url: soma("suburbsofgoa") },

  // rock / indie / metal
  { key: "bagel",               category: "rock", name: "BAGel Radio",          blurb: "indie / alternative rock", url: soma("bagel") },
  { key: "indiepop",            category: "rock", name: "Indie Pop Rocks",      blurb: "indie pop with hooks", url: soma("indiepop") },
  { key: "metal",               category: "rock", name: "Metal Detector",       blurb: "all metal, all the time", url: soma("metal") },

  // retro / 80s / oldies
  { key: "u80s",                category: "retro", name: "Underground 80s",    blurb: "new wave / post-punk / synth-pop", url: soma("u80s") },
  { key: "7soul",               category: "retro", name: "Seven Inch Soul",     blurb: "vintage 60s/70s soul + funk 45s", url: soma("7soul") },
  { key: "left",                category: "retro", name: "Left Coast 70s",      blurb: "70s mellow rock — California sound", url: soma("left") },

  // country / folk / world-trad
  { key: "bootliquor",          category: "country", name: "Boot Liquor",       blurb: "americana + outlaw country", url: soma("bootliquor") },
  { key: "folkfwd",             category: "country", name: "Folk Forward",      blurb: "indie folk + alt-country", url: soma("folkfwd") },
  { key: "thistle",             category: "country", name: "Thistle",           blurb: "celtic + irish trad", url: soma("thistle") },

  // eclectic (Radio Paradise)
  { key: "rp-main",             category: "eclectic", name: "RP Main Mix",      blurb: "eclectic blend — RP's signature mix", url: "https://stream.radioparadise.com/mp3-128" },
  { key: "rp-mellow",           category: "eclectic", name: "RP Mellow Mix",    blurb: "softer eclectic — wind-down vibe", url: "https://stream.radioparadise.com/mellow-128" },
  { key: "rp-rock",             category: "eclectic", name: "RP Rock Mix",      blurb: "rock-focused eclectic", url: "https://stream.radioparadise.com/rock-128" },
  { key: "rp-global",           category: "eclectic", name: "RP Global Mix",    blurb: "world music + global pop", url: "https://stream.radioparadise.com/global-128" },

  // jazz
  { key: "sonicuniverse",       category: "jazz", name: "Sonic Universe",       blurb: "modern jazz + fusion", url: soma("sonicuniverse") },
  { key: "secretagent",         category: "jazz", name: "Secret Agent",         blurb: "jazzy spy / lounge / exotica", url: soma("secretagent") },
];

export const STATION_KEYS = STATIONS.map((s) => s.key);

export function stationByKey(key: string): Station | undefined {
  return STATIONS.find((s) => s.key === key);
}

export function stationsByCategory(): Array<{ category: StationCategory; label: string; stations: Station[] }> {
  return CATEGORY_ORDER.map((cat) => ({
    category: cat,
    label: CATEGORY_LABELS[cat],
    stations: STATIONS.filter((s) => s.category === cat),
  })).filter((g) => g.stations.length > 0);
}

export function nextStationKey(currentKey: string): string {
  const i = STATIONS.findIndex((s) => s.key === currentKey);
  const next = STATIONS[(i + 1) % STATIONS.length]!;
  return next.key;
}

export function prevStationKey(currentKey: string): string {
  const i = STATIONS.findIndex((s) => s.key === currentKey);
  const prev = STATIONS[(i - 1 + STATIONS.length) % STATIONS.length]!;
  return prev.key;
}
