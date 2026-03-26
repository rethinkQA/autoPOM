<script lang="ts">
  import { PRODUCTS, CATEGORIES, SHIPPING, type Product, type ShippingKey } from '@shared/data';
  import {
    filterAndSortProducts, toggleSort, cartMessage,
    formatDate as sharedFormatDate, type SortKey,
  } from '@shared/logic';
  import { toastStore } from '../lib/toast.svelte';
  import { Select, Checkbox, RadioGroup, Dialog } from 'bits-ui';
  import flatpickr from 'flatpickr';
  import 'flatpickr/dist/flatpickr.css';

  // ===== Filter state =====
  let searchTerm = $state('');
  let category = $state('All');
  let inStockOnly = $state(false);

  // ===== Sort state =====
  let sortKey = $state<SortKey | null>(null);
  let sortAsc = $state(true);

  // ===== Interactive state =====
  let quantity = $state(1);
  let shipping: ShippingKey = $state('standard');
  let deliveryDate = $state<Date | null>(null);
  let actionOutput = $state('');
  let validationMsg = $state('');
  let showValidation = $state(false);

  // ===== Modal =====
  let modalProduct = $state<Product | null>(null);
  let modalOpen = $state(false);

  // ===== Delayed content =====
  let delayedText = $state('Loading recommendations…');

  $effect(() => {
    const timer = setTimeout(() => {
      delayedText = 'You might also like: USB-C Hub, Winter Jacket, Cooking Basics';
    }, 1500);
    return () => clearTimeout(timer);
  });

  // ===== Filtering + Sorting =====
  let filteredProducts = $derived.by(() => {
    return filterAndSortProducts(
      PRODUCTS,
      { searchTerm, category, inStockOnly },
      { key: sortKey, ascending: sortAsc },
    );
  });

  // ===== Helpers =====
  function formatPrice(price: number): string {
    return `$${price.toFixed(2)}`;
  }

  function formatDate(date: Date | null): string {
    return sharedFormatDate(date);
  }

  function getSortIndicator(key: string): string {
    if (sortKey !== key) return ' ⇅';
    return sortAsc ? ' ▲' : ' ▼';
  }

  // ===== Handlers =====
  function handleSort(key: string) {
    const next = toggleSort({ key: sortKey, ascending: sortAsc }, key as SortKey);
    sortKey = next.key;
    sortAsc = next.ascending;
  }

  function handleSortKeyDown(e: KeyboardEvent, key: string) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleSort(key);
    }
  }

  function addToCart(product: Product) {
    const msg = cartMessage(quantity, product.name);
    actionOutput = msg;
    toastStore.show(msg);
  }

  function handleActionButton() {
    if (filteredProducts.length === 0) {
      validationMsg = 'Please enter a search term';
      showValidation = true;
      return;
    }
    showValidation = false;
    addToCart(filteredProducts[0]);
  }

  function handleSearchKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      if (!searchTerm.trim()) {
        validationMsg = 'Please enter a search term';
        showValidation = true;
      } else {
        showValidation = false;
      }
    }
  }

  function openModal(product: Product) {
    modalProduct = product;
    modalOpen = true;
  }

  function closeModal() {
    modalOpen = false;
    modalProduct = null;
  }

  // ===== Flatpickr action =====
  function useFlatpickr(node: HTMLInputElement) {
    const instance = flatpickr(node, {
      dateFormat: 'm/d/Y',
      onChange: (selectedDates: Date[]) => {
        deliveryDate = selectedDates[0] || null;
      },
    });
    const fp = Array.isArray(instance) ? instance[0] : instance;
    return {
      destroy() {
        fp.destroy();
      },
    };
  }
</script>

<!-- Filter Controls (Bits UI for select & checkbox) -->
<div class="filter-bar">
  <div class="filter-group">
    <label for="search-input">Search Products</label>
    <input
      type="text"
      id="search-input"
      placeholder="Search by name…"
      bind:value={searchTerm}
      onkeydown={handleSearchKeyDown}
    />
  </div>

  <div class="filter-group">
    <span id="category-label">Category</span>
    <Select.Root type="single" value={category} onValueChange={(v) => { if (v) category = v; }}>
      <Select.Trigger class="bits-select-trigger" aria-labelledby="category-label" role="combobox">
        {category}
      </Select.Trigger>
      <Select.Content class="bits-select-content">
        {#each CATEGORIES as cat}
          <Select.Item value={cat} class="bits-select-item" label={cat}>
            {cat}
          </Select.Item>
        {/each}
      </Select.Content>
    </Select.Root>
  </div>

  <div class="filter-group filter-checkbox">
    <Checkbox.Root
      checked={inStockOnly}
      onCheckedChange={(v) => { inStockOnly = v === true; }}
      class="bits-checkbox"
      aria-label="Show only in-stock items"
    >
      {#snippet children({ checked })}
        <span class="bits-checkbox-indicator">{checked ? '✓' : ''}</span>
      {/snippet}
    </Checkbox.Root>
    <label onclick={() => { inStockOnly = !inStockOnly; }}>Show only in-stock items</label>
  </div>
</div>

<!-- Validation Message -->
{#if showValidation}
  <div class="validation-message" aria-live="polite">
    {validationMsg}
  </div>
{/if}

<!-- Product Data Table -->
<table class="data-table">
  <thead>
    <tr>
      <th role="button" tabindex="0" data-sort-key="name" aria-label="Sort by Name"
          onclick={() => handleSort('name')} onkeydown={(e) => handleSortKeyDown(e, 'name')}>
        Name{getSortIndicator('name')}
      </th>
      <th role="button" tabindex="0" data-sort-key="price" aria-label="Sort by Price"
          onclick={() => handleSort('price')} onkeydown={(e) => handleSortKeyDown(e, 'price')}>
        Price{getSortIndicator('price')}
      </th>
      <th role="button" tabindex="0" data-sort-key="category" aria-label="Sort by Category"
          onclick={() => handleSort('category')} onkeydown={(e) => handleSortKeyDown(e, 'category')}>
        Category{getSortIndicator('category')}
      </th>
        <th role="button" tabindex="0" data-sort-key="inStock" aria-label="Sort by Stock"
            onclick={() => handleSort('inStock')} onkeydown={(e) => handleSortKeyDown(e, 'inStock')}>
          Stock{getSortIndicator('inStock')}
      </th>
      <th>Actions</th>
    </tr>
  </thead>
  <tbody>
    {#if filteredProducts.length === 0}
      <tr class="empty-state">
        <td colspan="5">No products found.</td>
      </tr>
    {:else}
      {#each filteredProducts as product (product.name)}
        <tr>
          <td>
            <button class="view-details-btn"
                    onclick={() => openModal(product)}>
              {product.name}
            </button>
          </td>
          <td>{formatPrice(product.price)}</td>
          <td>{product.category}</td>
          <td>{product.inStock ? 'Yes' : 'No'}</td>
          <td>
            <button class="btn-primary btn-sm"
                    onclick={() => addToCart(product)}>
              Add to Cart
            </button>
          </td>
        </tr>
      {/each}
    {/if}
  </tbody>
</table>

<!-- Order Controls -->
<div class="order-controls">
  <!-- Quantity Stepper -->
  <fieldset class="control-group">
    <legend>Quantity</legend>
    <div class="stepper">
      <button aria-label="Decrease quantity"
              disabled={quantity <= 1} onclick={() => { quantity = Math.max(1, quantity - 1); }}>−</button>
      <input type="number" id="quantity-input"
             value={quantity} min={1} max={99} readonly aria-label="Quantity" />
      <button aria-label="Increase quantity"
              disabled={quantity >= 99} onclick={() => { quantity = Math.min(99, quantity + 1); }}>+</button>
    </div>
  </fieldset>

  <!-- Shipping Radio Group (Bits UI) -->
  <fieldset class="control-group radio-group">
    <legend>Shipping Method</legend>
    <RadioGroup.Root value={shipping} onValueChange={(v) => { if (v) shipping = v; }} aria-label="Shipping Method" class="bits-radio-group">
      {#each Object.entries(SHIPPING) as [key, { label, cost }]}
        <div class="bits-radio-item-row">
          <RadioGroup.Item value={key} class="bits-radio-item" aria-label="{label} — {formatPrice(cost)}">
            {#snippet children({ checked })}
              <span class="bits-radio-indicator">{checked ? '●' : '○'}</span>
            {/snippet}
          </RadioGroup.Item>
          <span>{label} — {formatPrice(cost)}</span>
        </div>
      {/each}
    </RadioGroup.Root>
    <div class="radio-output" aria-live="polite">
      Shipping: {formatPrice(SHIPPING[shipping].cost)}
    </div>
  </fieldset>

  <!-- Date Picker -->
  <fieldset class="control-group">
    <legend>Delivery Date</legend>
    <label for="delivery-date">Choose a date</label>
    <div>
      <input
        type="text"
        id="delivery-date"
        use:useFlatpickr
        placeholder="Select a date"
        class="datepicker-input"
      />
    </div>
    <div class="date-output" aria-live="polite">
      {formatDate(deliveryDate)}
    </div>
  </fieldset>
</div>

<!-- Action Button + Output -->
<div class="action-area">
  <button class="btn-primary" onclick={handleActionButton}>
    Add to Cart
  </button>
  <div class="action-output" aria-live="polite">
    {actionOutput}
  </div>
</div>

<!-- Item List -->
<div class="section">
  <h2>Popular Items</h2>
  <ul class="item-list">
    <li>Wireless Mouse</li>
    <li>Bluetooth Keyboard</li>
    <li>Running Shoes</li>
  </ul>
</div>

<!-- Delayed Content -->
<div class="section">
  <h2>Recommendations</h2>
  <div aria-live="polite">{delayedText}</div>
</div>

<!-- Modal (Bits UI Dialog) -->
<Dialog.Root open={modalOpen} onOpenChange={(open) => { if (!open) closeModal(); }}>
  <Dialog.Content class="bits-dialog-content modal">
    {#if modalProduct}
      <Dialog.Title>{modalProduct.name}</Dialog.Title>
      <p>
        {modalProduct.name} — {formatPrice(modalProduct.price)} | Category: {modalProduct.category} | {modalProduct.inStock ? 'In Stock' : 'Out of Stock'}
      </p>
      <button class="btn-secondary" aria-label="Close dialog"
              onclick={closeModal}>
        Close
      </button>
    {/if}
  </Dialog.Content>
</Dialog.Root>
