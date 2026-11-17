/**
 * CUSTOMIZABLE: product data. Everything here is HYPOTHETICAL specification
 * for an academic project and is stored as configurable data, not code.
 *
 * Caffeine content per flavor is NOT established. `caffeine.status` is
 * "unknown" by default and the policy engine treats unknown as "cannot pass".
 * Operators with verified lab values set them through `PRODUCT_CAFFEINE_JSON`
 * (see lib/env.ts), e.g. {"chai":{"mg":40,"status":"verified"}}.
 * Demo sessions apply `DEMO_ILLUSTRATIVE_CAFFEINE`, always labeled illustrative.
 */

export const FLAVORS = ["chai", "oolong", "matcha"] as const;
export type Flavor = (typeof FLAVORS)[number];

export type CaffeineStatus = "verified" | "illustrative" | "unknown";
export interface CaffeineInfo {
  mg: number | null;
  status: CaffeineStatus;
}

export interface Product {
  flavor: Flavor;
  name: string;
  tagline: string;
  description: string;
  canSize: "12 oz";
  proteinGrams: number;
  sugarGramsMax: number;
  tea: string;
  /** Hypothetical ingredient list. `ingredientsVerified` gates dietary-compatibility claims. */
  ingredients: string[];
  ingredientsVerified: boolean;
  allergens: string[];
  nutrition: { calories: number | null; proteinG: number; sugarG: string; note: string };
  caffeine: CaffeineInfo;
}

const nutritionNote = "Hypothetical specification. Full nutrition panel not established.";

export const BASE_PRODUCTS: Record<Flavor, Product> = {
  chai: {
    flavor: "chai",
    name: "Chai",
    tagline: "Warm spice, steady finish.",
    description: "Brewed black tea with cinnamon, cardamom and ginger, blended with milk protein.",
    canSize: "12 oz",
    proteinGrams: 20,
    sugarGramsMax: 5,
    tea: "Brewed black tea",
    ingredients: ["Brewed black tea", "Milk protein", "Cinnamon", "Cardamom", "Ginger", "Natural flavor"],
    ingredientsVerified: false,
    allergens: ["Milk"],
    nutrition: { calories: null, proteinG: 20, sugarG: "under 5", note: nutritionNote },
    caffeine: { mg: null, status: "unknown" },
  },
  oolong: {
    flavor: "oolong",
    name: "Oolong",
    tagline: "Toasted, floral, quiet.",
    description: "Brewed roasted oolong with a light floral edge, blended with milk protein.",
    canSize: "12 oz",
    proteinGrams: 20,
    sugarGramsMax: 5,
    tea: "Brewed oolong tea",
    ingredients: ["Brewed oolong tea", "Milk protein", "Natural flavor"],
    ingredientsVerified: false,
    allergens: ["Milk"],
    nutrition: { calories: null, proteinG: 20, sugarG: "under 5", note: nutritionNote },
    caffeine: { mg: null, status: "unknown" },
  },
  matcha: {
    flavor: "matcha",
    name: "Matcha",
    tagline: "Grassy, smooth, bright.",
    description: "Stone-ground matcha whisked into brewed green tea, blended with milk protein.",
    canSize: "12 oz",
    proteinGrams: 20,
    sugarGramsMax: 5,
    tea: "Brewed green tea and matcha",
    ingredients: ["Brewed green tea", "Matcha", "Milk protein", "Natural flavor"],
    ingredientsVerified: false,
    allergens: ["Milk"],
    nutrition: { calories: null, proteinG: 20, sugarG: "under 5", note: nutritionNote },
    caffeine: { mg: null, status: "unknown" },
  },
};

/** Demo-only illustrative values. NOT measurements. Always shown with an "illustrative" label. */
export const DEMO_ILLUSTRATIVE_CAFFEINE: Record<Flavor, number> = { chai: 40, oolong: 30, matcha: 35 };

export const OFFERS = {
  trial: { id: "trial", name: "Trial box", cans: 12, priceCents: 4200, recurring: false, blurb: "12 cans, any flavor mix. One time." },
  subscription: {
    id: "subscription",
    name: "Monthly subscription",
    cans: 24,
    priceCents: 7200,
    recurring: true,
    blurb: "24 cans every month. Pause, skip, advance or delay anytime.",
  },
} as const;
export type OfferId = keyof typeof OFFERS;

export const defaultMix = (cans: number): Record<Flavor, number> => {
  const each = Math.floor(cans / 3);
  return { chai: each + (cans - each * 3), oolong: each, matcha: each };
};

export const money = (cents: number) => `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
export const pricePerCan = (offer: { cans: number; priceCents: number }) => money(Math.round(offer.priceCents / offer.cans));

export const EXTERNAL_CAFFEINE_PRESETS = [
  { id: "coffee", label: "Coffee (8 oz)", mg: 95 as number | null, note: "Typical estimate, varies widely" },
  { id: "espresso", label: "Espresso shot", mg: 63 as number | null, note: "Typical estimate" },
  { id: "black-tea", label: "Black tea (8 oz)", mg: 47 as number | null, note: "Typical estimate" },
  { id: "green-tea", label: "Green tea (8 oz)", mg: 28 as number | null, note: "Typical estimate" },
  { id: "energy", label: "Energy drink (12 oz)", mg: 114 as number | null, note: "Typical estimate, brand varies" },
  { id: "unknown", label: "Something else, not sure", mg: null as number | null, note: "Amount unknown" },
];

export const DIETARY_OPTIONS = [
  { id: "dairy-free", label: "Dairy-free / milk allergy", milkConflict: true },
  { id: "vegan", label: "Vegan", milkConflict: true },
  { id: "lactose", label: "Lactose intolerant", milkConflict: true },
  { id: "gluten-free", label: "Gluten-free", milkConflict: false },
  { id: "nut-free", label: "Nut allergy", milkConflict: false },
  { id: "soy-free", label: "Soy allergy", milkConflict: false },
];
