import type { Job } from "./domain";
import { normalizeText } from "./engine.ts";

/**
 * Places NextJOB can put on a map without a geocoding service: every Italian provincial
 * capital (job boards name the city or "Provincia di …"), the regions as a coarse
 * fallback, and the European cities that show up in cross-border listings.
 */

export type GeoPlace = { name: string; aliases?: string[]; region?: string; country: string; lat: number; lon: number; kind: "city" | "region" };
export type GeoPoint = { lat: number; lon: number };
export type LocatedPlace = GeoPoint & { name: string; country: string; region?: string; kind: GeoPlace["kind"] };

const it = (name: string, region: string, lat: number, lon: number, aliases?: string[]): GeoPlace => ({ name, aliases, region, country: "IT", lat, lon, kind: "city" });
const eu = (name: string, country: string, lat: number, lon: number, aliases?: string[]): GeoPlace => ({ name, aliases, country, lat, lon, kind: "city" });
const region = (name: string, lat: number, lon: number, aliases?: string[]): GeoPlace => ({ name, aliases, country: "IT", lat, lon, kind: "region" });

export const GEO_PLACES: GeoPlace[] = [
  // Abruzzo
  it("L'Aquila", "Abruzzo", 42.35, 13.40, ["Aquila"]), it("Chieti", "Abruzzo", 42.35, 14.17), it("Pescara", "Abruzzo", 42.46, 14.21), it("Teramo", "Abruzzo", 42.66, 13.70),
  // Basilicata
  it("Potenza", "Basilicata", 40.64, 15.80), it("Matera", "Basilicata", 40.67, 16.60),
  // Calabria
  it("Catanzaro", "Calabria", 38.91, 16.59), it("Cosenza", "Calabria", 39.30, 16.25), it("Crotone", "Calabria", 39.08, 17.12), it("Reggio Calabria", "Calabria", 38.11, 15.65), it("Vibo Valentia", "Calabria", 38.68, 16.10),
  // Campania
  it("Napoli", "Campania", 40.85, 14.27, ["Naples"]), it("Avellino", "Campania", 40.91, 14.79), it("Benevento", "Campania", 41.13, 14.78), it("Caserta", "Campania", 41.07, 14.33), it("Salerno", "Campania", 40.68, 14.77),
  // Emilia-Romagna
  it("Bologna", "Emilia-Romagna", 44.49, 11.34), it("Ferrara", "Emilia-Romagna", 44.84, 11.62), it("Forlì", "Emilia-Romagna", 44.22, 12.04, ["Forli", "Cesena", "Forlì-Cesena"]), it("Modena", "Emilia-Romagna", 44.65, 10.93), it("Parma", "Emilia-Romagna", 44.80, 10.33), it("Piacenza", "Emilia-Romagna", 45.05, 9.69), it("Ravenna", "Emilia-Romagna", 44.42, 12.20), it("Reggio Emilia", "Emilia-Romagna", 44.70, 10.63, ["Reggio nell'Emilia"]), it("Rimini", "Emilia-Romagna", 44.06, 12.57),
  // Friuli-Venezia Giulia
  it("Trieste", "Friuli-Venezia Giulia", 45.65, 13.78), it("Gorizia", "Friuli-Venezia Giulia", 45.94, 13.62), it("Pordenone", "Friuli-Venezia Giulia", 45.96, 12.66), it("Udine", "Friuli-Venezia Giulia", 46.06, 13.24),
  // Lazio
  it("Roma", "Lazio", 41.90, 12.50, ["Rome"]), it("Frosinone", "Lazio", 41.64, 13.35), it("Latina", "Lazio", 41.47, 12.90), it("Rieti", "Lazio", 42.40, 12.86), it("Viterbo", "Lazio", 42.42, 12.10),
  // Liguria
  it("Genova", "Liguria", 44.41, 8.93, ["Genoa"]), it("Imperia", "Liguria", 43.89, 8.03), it("La Spezia", "Liguria", 44.10, 9.82), it("Savona", "Liguria", 44.31, 8.48),
  // Lombardia
  it("Milano", "Lombardia", 45.46, 9.19, ["Milan"]), it("Bergamo", "Lombardia", 45.70, 9.67), it("Brescia", "Lombardia", 45.54, 10.22), it("Como", "Lombardia", 45.81, 9.09), it("Cremona", "Lombardia", 45.13, 10.02), it("Lecco", "Lombardia", 45.86, 9.40), it("Lodi", "Lombardia", 45.31, 9.50), it("Mantova", "Lombardia", 45.16, 10.79, ["Mantua"]), it("Monza", "Lombardia", 45.58, 9.27, ["Monza e Brianza", "Monza e della Brianza", "Brianza"]), it("Pavia", "Lombardia", 45.19, 9.16), it("Sondrio", "Lombardia", 46.17, 9.87), it("Varese", "Lombardia", 45.82, 8.83),
  // Marche
  it("Ancona", "Marche", 43.62, 13.52), it("Ascoli Piceno", "Marche", 42.85, 13.58), it("Fermo", "Marche", 43.16, 13.72), it("Macerata", "Marche", 43.30, 13.45), it("Pesaro", "Marche", 43.91, 12.91, ["Pesaro e Urbino", "Urbino"]),
  // Molise
  it("Campobasso", "Molise", 41.56, 14.66), it("Isernia", "Molise", 41.59, 14.23),
  // Piemonte
  it("Torino", "Piemonte", 45.07, 7.69, ["Turin"]), it("Alessandria", "Piemonte", 44.91, 8.61), it("Asti", "Piemonte", 44.90, 8.21), it("Biella", "Piemonte", 45.57, 8.05), it("Cuneo", "Piemonte", 44.38, 7.54), it("Novara", "Piemonte", 45.45, 8.62), it("Verbania", "Piemonte", 45.92, 8.55, ["Verbano-Cusio-Ossola"]), it("Vercelli", "Piemonte", 45.32, 8.42),
  // Puglia
  it("Bari", "Puglia", 41.12, 16.87), it("Barletta", "Puglia", 41.32, 16.28, ["Barletta-Andria-Trani", "Andria", "Trani"]), it("Brindisi", "Puglia", 40.63, 17.94), it("Foggia", "Puglia", 41.46, 15.54), it("Lecce", "Puglia", 40.35, 18.17), it("Taranto", "Puglia", 40.47, 17.24),
  // Sardegna
  it("Cagliari", "Sardegna", 39.22, 9.12), it("Nuoro", "Sardegna", 40.32, 9.33), it("Oristano", "Sardegna", 39.90, 8.59), it("Sassari", "Sardegna", 40.73, 8.56), it("Carbonia", "Sardegna", 39.17, 8.52, ["Sud Sardegna"]),
  // Sicilia
  it("Palermo", "Sicilia", 38.12, 13.36), it("Agrigento", "Sicilia", 37.31, 13.58), it("Caltanissetta", "Sicilia", 37.49, 14.06), it("Catania", "Sicilia", 37.50, 15.09), it("Enna", "Sicilia", 37.57, 14.28), it("Messina", "Sicilia", 38.19, 15.55), it("Ragusa", "Sicilia", 36.93, 14.73), it("Siracusa", "Sicilia", 37.08, 15.29, ["Syracuse"]), it("Trapani", "Sicilia", 38.02, 12.51),
  // Toscana
  it("Firenze", "Toscana", 43.77, 11.25, ["Florence"]), it("Arezzo", "Toscana", 43.46, 11.88), it("Grosseto", "Toscana", 42.76, 11.11), it("Livorno", "Toscana", 43.55, 10.31, ["Leghorn"]), it("Lucca", "Toscana", 43.84, 10.50), it("Massa", "Toscana", 44.04, 10.14, ["Massa-Carrara", "Carrara"]), it("Pisa", "Toscana", 43.72, 10.40), it("Pistoia", "Toscana", 43.93, 10.92), it("Prato", "Toscana", 43.88, 11.10), it("Siena", "Toscana", 43.32, 11.33),
  // Trentino-Alto Adige
  it("Trento", "Trentino-Alto Adige", 46.07, 11.12, ["Trent"]), it("Bolzano", "Trentino-Alto Adige", 46.50, 11.35, ["Bozen"]),
  // Umbria
  it("Perugia", "Umbria", 43.11, 12.39), it("Terni", "Umbria", 42.56, 12.64),
  // Valle d'Aosta
  it("Aosta", "Valle d'Aosta", 45.74, 7.32, ["Aoste"]),
  // Veneto
  it("Venezia", "Veneto", 45.44, 12.33, ["Venice", "Mestre"]), it("Belluno", "Veneto", 46.14, 12.22), it("Padova", "Veneto", 45.41, 11.88, ["Padua"]), it("Rovigo", "Veneto", 45.07, 11.79), it("Treviso", "Veneto", 45.67, 12.24), it("Verona", "Veneto", 45.44, 10.99), it("Vicenza", "Veneto", 45.55, 11.55),
  // Italian regions as a coarse fallback ("Lombardia", "Sicilia")
  region("Lombardia", 45.6, 9.8, ["Lombardy"]), region("Lazio", 41.9, 12.8, ["Latium"]), region("Piemonte", 45.1, 7.9, ["Piedmont"]), region("Veneto", 45.6, 11.9), region("Emilia-Romagna", 44.5, 11.0, ["Emilia Romagna"]), region("Toscana", 43.4, 11.1, ["Tuscany"]), region("Campania", 40.9, 14.8), region("Sicilia", 37.6, 14.0, ["Sicily"]), region("Puglia", 41.0, 16.6, ["Apulia"]), region("Liguria", 44.3, 8.8), region("Sardegna", 40.0, 9.0, ["Sardinia"]), region("Calabria", 39.0, 16.5), region("Marche", 43.4, 13.2), region("Abruzzo", 42.3, 13.8), region("Friuli-Venezia Giulia", 46.0, 13.1, ["Friuli"]), region("Trentino-Alto Adige", 46.4, 11.3, ["Trentino", "Alto Adige", "South Tyrol"]), region("Umbria", 42.9, 12.5), region("Basilicata", 40.5, 16.0), region("Molise", 41.6, 14.6), region("Valle d'Aosta", 45.7, 7.4, ["Aosta Valley"]),
  // European cities that appear in cross-border listings
  eu("London", "GB", 51.51, -0.13, ["Londra"]), eu("Paris", "FR", 48.86, 2.35, ["Parigi"]), eu("Berlin", "DE", 52.52, 13.41, ["Berlino"]), eu("Madrid", "ES", 40.42, -3.70), eu("Barcelona", "ES", 41.39, 2.17, ["Barcellona"]), eu("Lisbon", "PT", 38.72, -9.14, ["Lisboa", "Lisbona"]), eu("Amsterdam", "NL", 52.37, 4.90), eu("Brussels", "BE", 50.85, 4.35, ["Bruxelles"]), eu("Vienna", "AT", 48.21, 16.37, ["Wien"]), eu("Zurich", "CH", 47.38, 8.54, ["Zürich", "Zurigo"]), eu("Geneva", "CH", 46.20, 6.14, ["Genève", "Ginevra"]), eu("Lugano", "CH", 46.00, 8.95), eu("Munich", "DE", 48.14, 11.58, ["München", "Monaco di Baviera"]), eu("Frankfurt", "DE", 50.11, 8.68, ["Francoforte"]), eu("Hamburg", "DE", 53.55, 9.99, ["Amburgo"]), eu("Dublin", "IE", 53.35, -6.26, ["Dublino"]), eu("Lyon", "FR", 45.76, 4.84, ["Lione"]), eu("Marseille", "FR", 43.30, 5.37, ["Marsiglia"]), eu("Nice", "FR", 43.70, 7.27, ["Nizza"]), eu("Valencia", "ES", 39.47, -0.38), eu("Porto", "PT", 41.15, -8.61), eu("Prague", "CZ", 50.08, 14.44, ["Praha", "Praga"]), eu("Warsaw", "PL", 52.23, 21.01, ["Warszawa", "Varsavia"]), eu("Copenhagen", "DK", 55.68, 12.57, ["København"]), eu("Stockholm", "SE", 59.33, 18.07, ["Stoccolma"]), eu("Athens", "GR", 37.98, 23.73, ["Atene"]), eu("Ljubljana", "SI", 46.06, 14.51, ["Lubiana"]), eu("Valletta", "MT", 35.90, 14.51, ["Malta"]), eu("Luxembourg", "LU", 49.61, 6.13, ["Lussemburgo"]), eu("Monaco", "MC", 43.74, 7.42, ["Monte Carlo"]),
];

type IndexedPlace = GeoPlace & { keys: string[] };

/** Longest names first so "Reggio Emilia" wins over any shorter overlap. */
const INDEX: IndexedPlace[] = GEO_PLACES
  .map((place) => ({ ...place, keys: [place.name, ...(place.aliases ?? [])].map((key) => normalizeText(key)).filter(Boolean) }))
  .sort((a, b) => Math.max(...b.keys.map((key) => key.length)) - Math.max(...a.keys.map((key) => key.length)));

function containsWord(haystack: string, needle: string): boolean {
  return ` ${haystack} `.includes(` ${needle} `);
}

/** The best-known place named in free text; cities beat regions, and nothing is guessed. */
export function resolvePlace(text: string): LocatedPlace | null {
  const normalized = normalizeText(text);
  if (!normalized) return null;
  let regionMatch: IndexedPlace | null = null;
  for (const place of INDEX) {
    if (!place.keys.some((key) => containsWord(normalized, key))) continue;
    if (place.kind === "city") return { name: place.name, country: place.country, region: place.region, lat: place.lat, lon: place.lon, kind: "city" };
    regionMatch ??= place;
  }
  return regionMatch ? { name: regionMatch.name, country: regionMatch.country, lat: regionMatch.lat, lon: regionMatch.lon, kind: "region" } : null;
}

export function locateJob(job: Pick<Job, "city" | "locationText">): LocatedPlace | null {
  return resolvePlace(job.city) ?? resolvePlace(job.locationText);
}

export function distanceKm(a: GeoPoint, b: GeoPoint): number {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const dLat = toRadians(b.lat - a.lat);
  const dLon = toRadians(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * 6371 * Math.asin(Math.sqrt(h)));
}

/** Distance from the candidate to a job; remote work is 0 km, an unlocatable posting is unknown. */
export function jobDistanceKm(job: Pick<Job, "city" | "locationText" | "workplace">, origin: GeoPoint): number | undefined {
  if (job.workplace === "Remote") return 0;
  const place = locateJob(job);
  return place ? distanceKm(origin, place) : undefined;
}

export function withinRadius(job: Pick<Job, "city" | "locationText" | "workplace"> & { countryCode?: string }, origin: GeoPoint, radiusKm: number, country?: string): boolean {
  // Remote is a work style, not worldwide work authorization. Only include a
  // remote posting in a local feed when its stated market permits that country.
  if (job.workplace === "Remote" && country && job.countryCode !== country && job.countryCode !== "EU") return false;
  const distance = jobDistanceKm(job, origin);
  return distance !== undefined && distance <= radiusKm;
}

export function parseGeoPoint(value: string | null | undefined): GeoPoint | null {
  if (!value) return null;
  const parts = value.split(",");
  if (parts.length !== 2 || parts.some((part) => !part.trim())) return null;
  const [lat, lon] = parts.map((part) => Number(part.trim()));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

export const DEFAULT_RADIUS_KM = 50;
export const RADIUS_OPTIONS_KM = [10, 25, 50, 100] as const;
