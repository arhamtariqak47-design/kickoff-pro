export interface Team {
  id: string;
  name: string;
  short: string;
  primary: string;
  secondary: string;
  rating: number;
}

export const TEAMS: Team[] = [
  { id: "red", name: "Crimson FC", short: "CRM", primary: "#dc2626", secondary: "#fff", rating: 88 },
  { id: "blue", name: "Azure United", short: "AZU", primary: "#2563eb", secondary: "#fff", rating: 86 },
  { id: "yellow", name: "Solar City", short: "SOL", primary: "#eab308", secondary: "#000", rating: 84 },
  { id: "green", name: "Verde SC", short: "VRD", primary: "#16a34a", secondary: "#fff", rating: 82 },
  { id: "purple", name: "Royal Violets", short: "ROY", primary: "#7c3aed", secondary: "#fff", rating: 85 },
  { id: "orange", name: "Ember Athletic", short: "EMB", primary: "#ea580c", secondary: "#fff", rating: 80 },
  { id: "black", name: "Night Owls", short: "NTO", primary: "#171717", secondary: "#fff", rating: 87 },
  { id: "white", name: "Polar Stars", short: "PLR", primary: "#f1f5f9", secondary: "#0f172a", rating: 83 },
];
