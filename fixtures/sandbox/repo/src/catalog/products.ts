export interface Product {
  id: string;
  name: string;
  /** Price in cents. */
  price: number;
  inStock: boolean;
}

const PRODUCTS: Product[] = [
  { id: "mug", name: "tiny-shop mug", price: 1200, inStock: true },
  { id: "tee", name: "tiny-shop T-shirt", price: 2500, inStock: true },
  { id: "cap", name: "tiny-shop cap", price: 1800, inStock: true },
  { id: "poster", name: "Poster (A2)", price: 3000, inStock: false },
];

export function listProducts(): Product[] {
  return [...PRODUCTS];
}

export function getProduct(id: string): Product {
  const product = PRODUCTS.find((p) => p.id === id);
  if (!product) throw new Error(`Unknown product: ${id}`);
  return product;
}
