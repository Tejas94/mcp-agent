import { getProduct } from "../catalog/products.js";

export interface CartLine {
  productId: string;
  name: string;
  /** Price of one unit in cents. */
  unitPrice: number;
  quantity: number;
}

export class Cart {
  private readonly items = new Map<string, CartLine>();

  add(productId: string, quantity = 1): void {
    if (quantity < 1) throw new Error("Quantity must be at least 1");
    const product = getProduct(productId);
    if (!product.inStock) throw new Error(`${product.name} is out of stock`);
    const line = this.items.get(productId);
    if (line) {
      line.quantity += quantity;
    } else {
      this.items.set(productId, { productId, name: product.name, unitPrice: product.price, quantity });
    }
  }

  remove(productId: string, quantity = 1): void {
    const line = this.items.get(productId);
    if (!line) return;
    line.quantity -= quantity;
    if (line.quantity <= 0) this.items.delete(productId);
  }

  lines(): CartLine[] {
    return [...this.items.values()];
  }

  /** The number shown on the cart badge in the header. */
  itemCount(): number {
    return this.items.size;
  }

  isEmpty(): boolean {
    return this.items.size === 0;
  }
}
