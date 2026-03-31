const SCENARIO_HERO_IMAGES = {
  metroRail: "https://images.pexels.com/photos/1427107/pexels-photo-1427107.jpeg",
  airportTerminal: "https://images.pexels.com/photos/358319/pexels-photo-358319.jpeg",
  industrialPlant: "https://images.pexels.com/photos/1108572/pexels-photo-1108572.jpeg",
  highwayPackage: "https://images.pexels.com/photos/594452/pexels-photo-594452.jpeg",
} as const;

const EVENT_IMAGES = {
  steel: "https://images.pexels.com/photos/1267338/pexels-photo-1267338.jpeg",
  weather: "https://images.pexels.com/photos/1118873/pexels-photo-1118873.jpeg",
  labour: "https://images.pexels.com/photos/1216589/pexels-photo-1216589.jpeg",
  regulatory: "https://images.pexels.com/photos/5668858/pexels-photo-5668858.jpeg",
  construction:
    "https://images.pexels.com/photos/159306/construction-site-build-construction-work-159306.jpeg",
} as const;

export function getScenarioTypeLabel(name: string | null | undefined) {
  const lower = (name ?? "").toLowerCase();

  if (lower.includes("metro")) return "Metro Rail";
  if (lower.includes("airport")) return "Airport Terminal";
  if (lower.includes("industrial") || lower.includes("plant")) return "Industrial Plant";
  if (lower.includes("highway") || lower.includes("road")) return "Highway Package";

  return "Highway Package";
}

export function getScenarioHeroImageUrl(name: string | null | undefined) {
  const scenarioType = getScenarioTypeLabel(name);

  if (scenarioType === "Metro Rail") return SCENARIO_HERO_IMAGES.metroRail;
  if (scenarioType === "Airport Terminal") return SCENARIO_HERO_IMAGES.airportTerminal;
  if (scenarioType === "Industrial Plant") return SCENARIO_HERO_IMAGES.industrialPlant;

  return SCENARIO_HERO_IMAGES.highwayPackage;
}

export function getDecisionEventImageUrl(title: string | null | undefined) {
  const lower = (title ?? "").toLowerCase();

  if (lower.includes("steel") || lower.includes("material") || lower.includes("supply")) {
    return EVENT_IMAGES.steel;
  }

  if (lower.includes("weather") || lower.includes("monsoon") || lower.includes("flood")) {
    return EVENT_IMAGES.weather;
  }

  if (
    lower.includes("labour") ||
    lower.includes("labor") ||
    lower.includes("worker") ||
    lower.includes("strike")
  ) {
    return EVENT_IMAGES.labour;
  }

  if (lower.includes("clearance") || lower.includes("permit") || lower.includes("regulatory")) {
    return EVENT_IMAGES.regulatory;
  }

  return EVENT_IMAGES.construction;
}

export function getExternalContextIcon(context: string | null | undefined) {
  const normalized = (context ?? "").trim().toLowerCase();

  if (normalized === "stable environment") return "🌤️";
  if (normalized === "material price spike") return "📈";
  if (normalized === "labor tightness" || normalized === "labour tightness") return "👷";
  if (normalized === "permitting delay") return "📋";
  if (normalized === "credit squeeze") return "💸";
  if (normalized === "weather disruption") return "🌧️";

  return "📍";
}

export function formatScenarioComplexity(complexity: string | null | undefined) {
  const normalized = (complexity ?? "").trim().toLowerCase();
  if (normalized === "high" || normalized === "extreme" || normalized === "moderate") {
    return normalized;
  }
  return "moderate";
}
