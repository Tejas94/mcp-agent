import assert from "node:assert/strict";
import { test } from "node:test";
import { Cart } from "../src/cart/cart.js";

test("adds to an existing line", () => {
  const cart = new Cart();
  cart.add("mug");
  cart.add("mug", 2);
  assert.equal(cart.lines()[0]?.quantity, 3);
});

test("removes a line when its quantity reaches zero", () => {
  const cart = new Cart();
  cart.add("cap");
  cart.remove("cap");
  assert.equal(cart.isEmpty(), true);
});

test("refuses products that are out of stock", () => {
  const cart = new Cart();
  assert.throws(() => cart.add("poster"), /out of stock/);
});
