export const CATEGORIES = [
  "garbage",
  "pothole",
  "streetlight",
  "water_leak",
  "safety_hazard",
  "other",
];

export const CATEGORY_LABELS = {
  garbage: "Garbage",
  pothole: "Pothole",
  streetlight: "Streetlight",
  water_leak: "Water leak",
  safety_hazard: "Safety hazard",
  other: "Other",
};

export const DEPARTMENTS = {
  garbage: "Sanitation Department",
  pothole: "Roads Department",
  streetlight: "Electricity Department",
  water_leak: "Water Department",
  safety_hazard: "Municipal Safety Department",
  other: "Municipal Corporation",
};

export const URGENCIES = ["low", "medium", "high"];
export const ISSUE_STATUSES = ["reported", "in_progress", "resolved"];

export const FALLBACK_ANALYSIS = {
  category: "other",
  urgency: "medium",
  description: "Civic issue reported through CampusFix AI.",
};

export function normalizeAnalysis(value) {
  if (
    !value ||
    !CATEGORIES.includes(value.category) ||
    !URGENCIES.includes(value.urgency)
  ) {
    return FALLBACK_ANALYSIS;
  }

  const description =
    typeof value.description === "string" &&
    value.description.trim().length > 0 &&
    value.description.trim().length <= 500
      ? value.description.trim()
      : FALLBACK_ANALYSIS.description;

  return {
    category: value.category,
    urgency: value.urgency,
    description,
  };
}
