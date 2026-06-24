/**
 * Dynamic sibling color swatches for product cards on collection/search pages.
 *
 * Each color is a separate product. Clicking a swatch fetches that product's
 * card body through the Section Rendering API and hands it to the parent
 * `product-card` element, which morphs `[data-product-card-body]` in place.
 *
 * Rapid clicks are handled "latest wins": every request aborts the previous
 * one, so only the most recently selected color is ever applied.
 *
 * @example
 * <dynamic-sibling-swatches>
 *   <button data-sibling-swatch data-product-url="/products/handle">...</button>
 * </dynamic-sibling-swatches>
 */

import { ProductCard } from '@theme/product-card';
import { getViewParameterValue } from '@theme/utilities';

const SECTION_ID = 'section-rendering-sibling-product-card';

class DynamicSiblingSwatches extends HTMLElement {
  /** @type {AbortController | undefined} */
  #abortController;

  connectedCallback() {
    // Capture phase: intercept the click before product-card navigates to the PDP.
    this.addEventListener('click', this.#onClick, true);
  }

  disconnectedCallback() {
    this.removeEventListener('click', this.#onClick, true);
    this.#abortController?.abort();
  }

  /** @returns {Element[]} */
  get #buttons() {
    return [...this.querySelectorAll('[data-sibling-swatch]')];
  }

  /**
   * Native `<button>` elements fire `click` on Enter/Space, so this one
   * handler covers both mouse and keyboard activation.
   * @param {Event} event
   */
  #onClick = (event) => {
    const target = event.target;
    const button = target instanceof Element ? target.closest('[data-sibling-swatch]') : null;

    if (!(button instanceof HTMLButtonElement) || !this.contains(button)) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    this.#select(button);
  };

  /**
   * Fetches the chosen sibling's card body and morphs it into the live card.
   * @param {HTMLButtonElement} button
   * @returns {Promise<void>}
   */
  async #select(button) {
    if (button.getAttribute('aria-current') === 'true') {
      return;
    }

    const productUrl = button.getAttribute('data-product-url');
    const card = this.closest('product-card');

    if (!productUrl || !(card instanceof ProductCard)) {
      return;
    }

    const previous = this.#buttons.find((btn) => btn.getAttribute('aria-current') === 'true');

    this.#abortController?.abort();
    const controller = new AbortController();
    this.#abortController = controller;

    this.#setActive(button);
    this.#setLoading(true);

    try {
      const response = await fetch(this.#buildUrl(productUrl), { signal: controller.signal });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const doc = new DOMParser().parseFromString(await response.text(), 'text/html');

      card.updateFromSiblingProduct(doc);
      button.focus();
    } catch (error) {
      if (error?.name === 'AbortError') {
        return;
      }

      if (previous) {
        this.#setActive(previous);
      }

      console.error('[dynamic-sibling-swatches]', error);
    } finally {
      // Only the latest request owns the loading state.
      if (this.#abortController === controller) {
        this.#setLoading(false);
      }
    }
  }

  /**
   * Builds the Section Rendering API URL for the sibling product.
   * @param {string} productUrl
   * @returns {URL}
   */
  #buildUrl(productUrl) {
    const url = new URL(productUrl, window.location.origin);
    url.searchParams.set('section_id', SECTION_ID);

    const view = getViewParameterValue();

    if (view) {
      url.searchParams.set('view', view);
    }

    return url;
  }

  /**
   * Marks the active swatch with `aria-current` and clears it from the rest.
   * @param {Element} active
   */
  #setActive(active) {
    for (const button of this.#buttons) {
      button.setAttribute('aria-current', button === active ? 'true' : 'false');
    }
  }

  /**
   * Reflects the fetch state for assistive tech and styling.
   * @param {boolean} loading
   */
  #setLoading(loading) {
    this.classList.toggle('dynamic-sibling-swatches--loading', loading);
    this.setAttribute('aria-busy', String(loading));
  }
}

if (!customElements.get('dynamic-sibling-swatches')) {
  customElements.define('dynamic-sibling-swatches', DynamicSiblingSwatches);
}
