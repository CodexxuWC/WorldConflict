export const CATALOG = {
  oil: {
    label: "Oil",
    unit: "barrel",
    icon: "🛢️",
    category: "energy"
  },
  iron: {
    label: "Iron",
    unit: "ton",
    icon: "⛓️",
    category: "raw"
  }
};

export function getItemMeta(id) {
  return CATALOG[id] || null;
}
