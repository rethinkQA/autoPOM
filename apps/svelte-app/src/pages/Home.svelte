<script lang="ts">
  import { PRODUCTS, CATEGORIES, SHIPPING, type Product } from '../data';
  import { toastStore } from '../lib/toast.svelte';
  import flatpickr from 'flatpickr';
  import 'flatpickr/dist/flatpickr.css';

  // ===== Filter state =====
  let searchTerm = $state('');
  let category = $state('All');
  let inStockOnly = $state(false);

  // ===== Sort state =====
  let sortKey = $state<string | null>(null);
  let sortAsc = $state(true);

  // ===== Interactive state =====
  let quantity = $state(1);
  let shipping = $state('standard');
  let deliveryDate = $state<Date | null>(null);
  let actionOutput = $state('');
  let validationMsg = $state('');
  let showValidation = $state(false);

  // ===== Modal =====
  let modalProduct = $state<Product | null>(null);

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
    let filtered = PRODUCTS.filter((p) => {
      if (searchTerm && !p.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      if (category !== 'All' && p.category !== category) return false;
      if (inStockOnly && !p.inStock) return false;
      return true;
    });

    if (sortKey) {
      filtered = [...filtered].sort((a, b) => {
        let valA: string | number;
        let valB: string | number;

        switch (sortKey) {
          case 'name':     valA = a.name.toLowerCase(); valB = b.name.toLowerCase(); break;
          case 'price':    valA = a.price; valB = b.price; break;
          case 'category': valA = a.category.toLowerCase(); valB = b.category.toLowerCase(); break;
          case 'stock':    valA = a.inStock ? 1 : 0; valB = b.inStock ? 1 : 0; break;
          default:         valA = ''; valB = '';
        }

        if (valA < valB) return sortAsc ? -1 : 1;
        if (valA > valB) return sortAsc ? 1 : -1;
        return 0;
      });
    }

    return filtered;
  });

  // ===== Helpers =====
  function formatPrice(price: number): string {
    return `$${price.toFixed(2)}`;
  }

  function formatDate(date: Date | null): string {
    if (!date) return '';
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  function getSortIndicator(key: string): string {
    if (sortKey !== key) return ' ⇅';
    return sortAsc ? ' ▲' : ' ▼';
  }

  // ===== Handlers =====
  function handleSort(key: string) {
    if (sortKey === key) {
      sortAsc = !sortAsc;
    } else {
      sortKey = key;
      sortAsc = true;
    }
  }

  function handleSortKeyDown(e: KeyboardEvent, key: string) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleSort(key);
    }
  }

  function addToCart(product: Product) {
    const msg = `Added ${quantity}x ${product.name} to cart`;
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
  }

  function closeModal() {
    modalProduct = null;
  }

  function handleModalBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) closeModal();
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

<!-- Filter Controls -->
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
    <label for="category-select">Category</label>
    <select
      id="category-select"
     
      bind:value={category}
    >
      {#each CATEGORIES as cat}
        <option value={cat}>{cat}</option>
      {/each}
    </select>
  </div>
  <div class="filter-group filter-checkbox">
    <input
      type="checkbox"
      id="stock-checkbox"
     
      bind:checked={inStockOnly}
    />
    <label for="stock-checkbox">Show only in-stock items</label>
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
      <th role="button" tabindex="0" data-sort-key="stock" aria-label="Sort by Stock"
          onclick={() => handleSort('stock')} onkeydown={(e) => handleSortKeyDown(e, 'stock')}>
        Stock{getSortIndicator('stock')}
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

  <!-- Shipping Radio Group -->
  <fieldset class="control-group radio-group">
    <legend>Shipping Method</legend>
    {#each Object.entries(SHIPPING) as [key, { label, cost }]}
      <label>
        <input type="radio" name="shipping" value={key}
               bind:group={shipping} />
        {label} — {formatPrice(cost)}
      </label>
    {/each}
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

<!-- Modal -->
{#if modalProduct}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <dialog class="modal" open
          onclick={handleModalBackdropClick}>
    <div class="modal-content">
      <h2>{modalProduct.name}</h2>
      <p>
        {modalProduct.name} — {formatPrice(modalProduct.price)} | Category: {modalProduct.category} | {modalProduct.inStock ? 'In Stock' : 'Out of Stock'}
      </p>
      <button class="btn-secondary" aria-label="Close dialog"
              onclick={closeModal}>
        Close
      </button>
    </div>
  </dialog>
{/if}
