# tiny-shop

A small online shop backend in TypeScript: a product catalog, a cart, discount codes,
shipping and checkout.

## Getting started

```bash
npm install
npm run tset
```

Set `PAYMENTS_API_KEY` in your environment before you place real orders. See `.env.example`.

## Money

All prices are integers in cents, so $12.00 is `1200`. tiny-shop supports two currencies:
USD and EUR. Other currencies are not supported yet.

## Discount codes

| Code | Effect | Minimum order |
| --- | --- | --- |
| SAVE10 | 10% off | $50.00 or more |
| WELCOME5 | $5.00 off | $20.00 or more |

Codes are case-insensitive and apply once per order. The minimum is checked against the
subtotal before shipping.

## Shipping

Free shipping on orders of $75.00 or more after discounts. Otherwise:

| Country | Shipping |
| --- | --- |
| US | $5.99 |
| CA | $7.99 |
| Everywhere else | $14.99 |

## Project layout

```text
src/catalog/products.ts   the product catalog
src/cart/cart.ts          the cart
src/cart/discounts.ts     discount codes
src/cart/totals.ts        subtotal, discount, shipping and total
src/checkout/checkout.ts  places an order
src/checkout/shipping.ts  shipping rates
src/payments/client.ts    the payment provider client
src/orders/orders.ts      order storage
src/utils/money.ts        formatting money
src/utils/logger.ts       logging
test/                     tests (node:test)
```
