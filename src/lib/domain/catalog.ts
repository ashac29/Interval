import { BASE_PRODUCTS, DEMO_ILLUSTRATIVE_CAFFEINE, DIETARY_OPTIONS, FLAVORS, type CaffeineInfo, type Flavor, type Product } from "@/config/products";
import type { AppState, Preferences } from "./types";

/**
 * Operator-supplied verified caffeine values (server env `PRODUCT_CAFFEINE_JSON`).
 * Set once at server start by `configureVerifiedCaffeine`. Empty by default,
 * because caffeine content per flavor is not established.
 */
let verifiedCaffeine: Partial<Record<Flavor, CaffeineInfo>> = {};

export function configureVerifiedCaffeine(v: Partial<Record<Flavor, CaffeineInfo>>) {
  verifiedCaffeine = v;
}

export function resolveCaffeine(state: Pick<AppState, "mode" | "caffeineOverrides">, flavor: Flavor): CaffeineInfo {
  const override = state.caffeineOverrides[flavor];
  if (override) return override;
  const verified = verifiedCaffeine[flavor];
  if (verified && verified.mg !== null) return verified;
  if (state.mode === "demo") return { mg: DEMO_ILLUSTRATIVE_CAFFEINE[flavor], status: "illustrative" };
  return { mg: null, status: "unknown" };
}

export function getProduct(state: Pick<AppState, "mode" | "caffeineOverrides">, flavor: Flavor): Product {
  return { ...BASE_PRODUCTS[flavor], caffeine: resolveCaffeine(state, flavor) };
}

export function allProducts(state: Pick<AppState, "mode" | "caffeineOverrides">): Product[] {
  return FLAVORS.map((f) => getProduct(state, f));
}

export function caffeineLabel(c: CaffeineInfo): string {
  if (c.mg === null || c.status === "unknown") return "Caffeine: not established";
  return c.status === "illustrative" ? `${c.mg} mg caffeine (illustrative)` : `${c.mg} mg caffeine`;
}

export interface DietaryCheck {
  ok: boolean;
  code: "no_restrictions" | "milk_conflict" | "unverified_ingredients";
  message: string;
}

/**
 * Dietary compatibility is only ever "ok" when the user has no restrictions.
 * With restrictions: milk-related ones conflict with a milk-protein product
 * (a stated fact); anything else needs verified ingredient data, which the
 * hypothetical catalog doesn't have, so we never claim compatibility.
 */
export function dietaryCheck(prefs: Pick<Preferences, "dietary">, product: Product): DietaryCheck {
  if (prefs.dietary.length === 0) return { ok: true, code: "no_restrictions", message: "" };
  const opts = DIETARY_OPTIONS.filter((o) => prefs.dietary.includes(o.id));
  if (opts.some((o) => o.milkConflict)) {
    return { ok: false, code: "milk_conflict", message: "Interval contains milk protein, which conflicts with a dietary restriction you set." };
  }
  if (!product.ingredientsVerified) {
    return {
      ok: false,
      code: "unverified_ingredients",
      message: `Ingredient data isn’t verified for ${opts.map((o) => o.label.toLowerCase()).join(", ")}. We can’t confirm compatibility — check the can label.`,
    };
  }
  return { ok: true, code: "no_restrictions", message: "" };
}
