import fs from "node:fs";
import path from "node:path";

/**
 * CPG brand directory + category metadata loaders.
 *
 * Data lives in content/brands.json and content/categories.json so
 * new brands can be added without code changes. Anyone (including
 * non-engineers) can extend the directory by editing JSON.
 *
 * Server-only — uses node:fs. Don't import from client components.
 */

export interface Brand {
  slug: string;
  name: string;
  domain: string;
  category: string;
  blurb: string;
}

export interface Category {
  key: string;
  label: string;
  noun: string;
  questionsLeadIn: string;
  prompts: string[];
}

interface BrandsFile {
  brands: Brand[];
}

interface CategoriesFile {
  categories: Record<string, Omit<Category, "key">>;
}

let brandsCache: Brand[] | null = null;
let categoriesCache: Map<string, Category> | null = null;

const BRANDS_FILE = path.join(process.cwd(), "content", "brands.json");
const CATEGORIES_FILE = path.join(process.cwd(), "content", "categories.json");

export function listBrands(): Brand[] {
  if (brandsCache) return brandsCache;
  if (!fs.existsSync(BRANDS_FILE)) {
    brandsCache = [];
    return brandsCache;
  }
  const raw = fs.readFileSync(BRANDS_FILE, "utf8");
  const parsed = JSON.parse(raw) as BrandsFile;
  brandsCache = parsed.brands.filter((b) => b.slug && b.name && b.domain);
  return brandsCache;
}

export function getBrand(slug: string): Brand | null {
  if (!/^[a-z0-9-]+$/i.test(slug)) return null;
  return listBrands().find((b) => b.slug === slug) ?? null;
}

export function listCategories(): Map<string, Category> {
  if (categoriesCache) return categoriesCache;
  if (!fs.existsSync(CATEGORIES_FILE)) {
    categoriesCache = new Map();
    return categoriesCache;
  }
  const raw = fs.readFileSync(CATEGORIES_FILE, "utf8");
  const parsed = JSON.parse(raw) as CategoriesFile;
  const map = new Map<string, Category>();
  for (const [key, value] of Object.entries(parsed.categories)) {
    map.set(key, { key, ...value });
  }
  categoriesCache = map;
  return categoriesCache;
}

export function getCategory(key: string): Category | null {
  return listCategories().get(key) ?? null;
}

/**
 * Brands in the same category, excluding the one passed in. Used for
 * "Other [category] brands" footer links — gives crawlers internal
 * link density inside the category, which compounds topical authority.
 */
export function siblingBrands(slug: string, limit = 8): Brand[] {
  const brand = getBrand(slug);
  if (!brand) return [];
  return listBrands()
    .filter((b) => b.category === brand.category && b.slug !== slug)
    .slice(0, limit);
}

/**
 * Group all brands by category for the /brand index page.
 */
export function brandsByCategory(): Array<{
  category: Category;
  brands: Brand[];
}> {
  const cats = listCategories();
  const groups: Array<{ category: Category; brands: Brand[] }> = [];
  for (const [key, category] of cats) {
    const brands = listBrands().filter((b) => b.category === key);
    if (brands.length > 0) groups.push({ category, brands });
  }
  return groups;
}
