# Dynamic Swatch

A [Shopify Horizon](https://github.com/Shopify/horizon)-based theme with dynamic sibling color swatches on product listing pages.

## Getting started

Clone this repository and connect it to a Shopify store with [Shopify CLI](https://shopify.dev/docs/storefronts/themes/tools/cli).

## [Dynamic Swatch Feature]

### Added

- **Dynamic sibling color swatches** on collection and search product cards. Each color is a separate Shopify product, linked through the `custom.related_products_by_color` metafield (`list.product_reference`). Clicking a swatch replaces the whole card — image, title, price, badges, URL, and quick add — in place, with no full page reload.

#### New files

- `sections/section-rendering-sibling-product-card.liquid` — Section Rendering API endpoint that returns the target sibling's card body.
- `snippets/dynamic-sibling-swatches.liquid` — renders the `<dynamic-sibling-swatches>` swatch group from the metafield.
- `snippets/dynamic-sibling-swatch-button.liquid` — a single swatch button (product featured image, with a color-option swatch fallback).
- `assets/dynamic-sibling-swatches.js` — the `<dynamic-sibling-swatches>` web component (fetch + "latest wins" abort + accessibility state).
- `assets/dynamic-sibling-swatches.css` — swatch styling for the listing card.

#### Touchpoints in existing files

- `snippets/product-card.liquid` — wraps the card body in `[data-product-card-body]` (the morph target) and renders the swatch group on listing pages when the feature is enabled.
- `assets/product-card.js` — `ProductCard#updateFromSiblingProduct()` performs the in-place swap.
- `assets/quick-add.js` — `QuickAddComponent#clearCache()` drops the cached product fragment so quick add follows the new product.
- `snippets/swatch.liquid` — `force_variant_image` parameter so a swatch can always show the product image.
- `snippets/scripts.liquid`, `snippets/stylesheets.liquid` — load the component on collection/search pages when enabled.
- `config/settings_schema.json`, `locales/*` — `show_dynamic_sibling_swatches` setting and `products.dynamic_swatches.*` strings.

## How it works

### Two cooperating layers

The feature is server-rendered Liquid plus a small web component that swaps card bodies with the Section Rendering API. State lives in the DOM (`aria-current` on the active swatch).

### Server side (Liquid)

1. A listing card is rendered by `snippets/product-card.liquid`. It computes `show_sibling_swatches`: true only on `collection`/`search`, when `settings.show_dynamic_sibling_swatches` is on, and when the product's `custom.related_products_by_color` metafield has at least one entry (`.value.count > 0`).
2. When true, the normal card content is wrapped in `<div data-product-card-body>` (the morph target) and `snippets/dynamic-sibling-swatches.liquid` is rendered after it.
3. `dynamic-sibling-swatches.liquid` lists the sibling products. It uses the `has` filter to check whether the current product is already in the metafield list and, if not, appends it so the active color is always shown. Each entry renders a `dynamic-sibling-swatch-button`, which flags itself with `aria-current` when its id matches the product on the card.

### Client side (JavaScript)

The `<dynamic-sibling-swatches>` web component (`assets/dynamic-sibling-swatches.js`) owns the interaction:

1. **One click listener, capture phase.** It intercepts the click before `product-card` navigates to the PDP.
2. **Fetch via SRA.** It requests `<sibling-url>?section_id=section-rendering-sibling-product-card` (preserving the `view` param for A/B view testing).
3. **Latest wins.** Each request first aborts the previous one via `AbortController`. Rapid clicking therefore never produces a stale result — only the last color is applied — and superseded responses are dropped on `AbortError`. The loading state (`aria-busy`, `--loading` class) is owned only by the most recent request.
4. **Hand off to the card.** On success it parses the HTML and calls `ProductCard#updateFromSiblingProduct(doc)`.

### The in-place swap

`ProductCard#updateFromSiblingProduct()` (`assets/product-card.js`):

1. Reads the live gallery's `--gallery-aspect-ratio`.
2. `morph()`s the children of `[data-product-card-body]` to the response's body (the theme's standard morph primitive).
3. Re-applies the saved `--gallery-aspect-ratio` so the card keeps the grid's height instead of snapping to the sibling section's default ratio.
4. Updates the host `data-product-id`, the `view-event-payload`, the card link `href`, and the visually-hidden link title.
5. Clears the quick-add cache and prefetches the new product page, so "Add to cart" / quick add submits the **sibling's** variant id.

### Data flow at a glance

```
collection card (Liquid)
   └─ product.metafields.custom.related_products_by_color → <dynamic-sibling-swatches>
        └─ user clicks a color
             └─ JS fetch /products/{sibling}?section_id=section-rendering-sibling-product-card
                  └─ SRA returns <product-card data-sibling-product-card> … [data-product-card-body]
                       └─ ProductCard.updateFromSiblingProduct(doc)
                            └─ morph [data-product-card-body] + refresh url / id / quick-add
```

### Trade-offs

1. **Dedicated SRA section.** `section-rendering-sibling-product-card` is separate from the theme's `section-rendering-product-card` (which serves in-product variant morphing). Each section does one job, which keeps both flows easy to reason about.
2. **The sibling section uses static block presets.** SRA responses render the gallery/title/price blocks with preset settings rather than the live collection theme-editor settings. The aspect-ratio mismatch this causes is handled on the client (step 3 above); other settings are assumed to match the standard card.
3. **Aspect ratio is inherited, not recomputed.** Preserving the grid ratio keeps cards aligned (no layout jump). In `adapt` mode a sibling with a very different image shape is fit into the original card's ratio — an intentional consistency-over-exactness choice.
4. **Body morph assumes the standard card blocks** (gallery, title, price). Heavily customized card block layouts may need the sibling section's blocks adjusted to match.

## Metafield setup

In Shopify admin → Settings → Custom data → Products:

| Setting           | Value                              |
| ----------------- | ---------------------------------- |
| Namespace and key | `custom.related_products_by_color` |
| Type              | List of product references         |

On each product in a color family, add references to its siblings. The theme always includes the current product and de-duplicates it.

## License

Based on [Shopify Horizon](https://github.com/Shopify/horizon). See Horizon's LICENSE for upstream terms.
