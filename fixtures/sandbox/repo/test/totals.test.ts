import assert from "node:assert/strict";
import { test } from "node:test";
import { Cart } from "../src/cart/cart.js";
import { calculateTotals } from "../src/cart/totals.js";

test("adds up the lines and US shipping", () => {
  const cart = new Cart();
  cart.add("mug", 2);
  const totals = calculateTotals(cart, { country: "US" });
  assert.deepEqual(totals, { subtotal: 2400, discount: 0, shipping: 599, total: 2999 });
});

test("ships free from $75.00", () => {
  const cart = new Cart();
  cart.add("tee", 3);
  const totals = calculateTotals(cart, { country: "US" });
  assert.equal(totals.shipping, 0);
  assert.equal(totals.total, 7500);
});

test("ignores unknown discount codes", () => {
  const cart = new Cart();
  cart.add("cap");
  const totals = calculateTotals(cart, { country: "US", discountCode: "NOPE" });
  assert.equal(totals.discount, 0);
});
