<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { VueDatePicker } from '@vuepic/vue-datepicker';
import '@vuepic/vue-datepicker/dist/main.css';
import { useToast } from '../composables/useToast';
import { PRODUCTS, CATEGORIES, SHIPPING, type Product } from '../data';

type SortKey = 'name' | 'price' | 'category' | 'stock' | null;

// ===== Filter state =====
const searchTerm = ref('');
const category = ref('All');
const inStockOnly = ref(false);

// ===== Sort state =====
const sortKey = ref<SortKey>(null);
const sortAsc = ref(true);

// ===== Interactive state =====
const quantity = ref(1);
const shipping = ref('standard');
const deliveryDate = ref<Date | null>(null);
const actionOutput = ref('');
const validationMsg = ref('');
const showValidation = ref(false);

// ===== Modal =====
const modalProduct = ref<Product | null>(null);
const modalRef = ref<HTMLDialogElement | null>(null);

// ===== Delayed content =====
const delayedText = ref('Loading recommendations…');
let delayedTimer: ReturnType<typeof setTimeout>;

onMounted(() => {
  delayedTimer = setTimeout(() => {
    delayedText.value = 'You might also like: USB-C Hub, Winter Jacket, Cooking Basics';
  }, 1500);
});

onUnmounted(() => {
  clearTimeout(delayedTimer);
});

// ===== Toast =====
const toast = useToast();

// ===== Filtering + Sorting =====
const filteredProducts = computed(() => {
  const term = searchTerm.value.toLowerCase().trim();
  const cat = category.value;
  const stockOnly = inStockOnly.value;
  const sk = sortKey.value;
  const asc = sortAsc.value;

  let filtered = PRODUCTS.filter((p) => {
    if (term && !p.name.toLowerCase().includes(term)) return false;
    if (cat !== 'All' && p.category !== cat) return false;
    if (stockOnly && !p.inStock) return false;
    return true;
  });

  if (sk) {
    filtered = [...filtered].sort((a, b) => {
      let valA: string | number;
      let valB: string | number;

      switch (sk) {
        case 'name':     valA = a.name.toLowerCase(); valB = b.name.toLowerCase(); break;
        case 'price':    valA = a.price; valB = b.price; break;
        case 'category': valA = a.category.toLowerCase(); valB = b.category.toLowerCase(); break;
        case 'stock':    valA = a.inStock ? 1 : 0; valB = b.inStock ? 1 : 0; break;
      }

      if (valA < valB) return asc ? -1 : 1;
      if (valA > valB) return asc ? 1 : -1;
      return 0;
    });
  }

  return filtered;
});

// ===== Handlers =====
function handleSort(key: SortKey) {
  if (sortKey.value === key) {
    sortAsc.value = !sortAsc.value;
  } else {
    sortKey.value = key;
    sortAsc.value = true;
  }
}

function getSortIndicator(key: string): string {
  if (sortKey.value !== key) return ' ⇅';
  return sortAsc.value ? ' ▲' : ' ▼';
}

function handleSortKeydown(e: KeyboardEvent, key: SortKey) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    handleSort(key);
  }
}

function showToastMessage(msg: string) {
  toast.show(msg);
}

function addToCart(product: Product) {
  const msg = `Added ${quantity.value}x ${product.name} to cart`;
  actionOutput.value = msg;
  showToastMessage(msg);
}

function handleActionButton() {
  if (filteredProducts.value.length === 0) {
    validationMsg.value = 'Please enter a search term';
    showValidation.value = true;
    return;
  }
  showValidation.value = false;
  addToCart(filteredProducts.value[0]!);
}

function handleSearchKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    if (!searchTerm.value.trim()) {
      validationMsg.value = 'Please enter a search term';
      showValidation.value = true;
    } else {
      showValidation.value = false;
    }
  }
}

function formatDate(date: Date | null): string {
  if (!date) return '';
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function openModal(product: Product) {
  modalProduct.value = product;
  // Wait for next tick so the dialog element is in the DOM
  setTimeout(() => modalRef.value?.showModal(), 0);
}

function closeModal() {
  modalRef.value?.close();
  modalProduct.value = null;
}

function handleModalBackdropClick(e: MouseEvent) {
  if (e.target === modalRef.value) {
    closeModal();
  }
}

function handleDateUpdate(date: Date | null) {
  deliveryDate.value = date;
}
</script>

<template>
  <!-- Filter Controls -->
  <div class="filter-bar">
    <div class="filter-group">
      <label for="search-input">Search Products</label>
      <input
        type="text"
        id="search-input"
       
        placeholder="Search by name…"
        v-model="searchTerm"
        @keydown="handleSearchKeydown"
      />
    </div>
    <div class="filter-group">
      <label for="category-select">Category</label>
      <select id="category-select" v-model="category">
        <option v-for="c in CATEGORIES" :key="c" :value="c">{{ c }}</option>
      </select>
    </div>
    <div class="filter-group filter-checkbox">
      <input
        type="checkbox"
        id="stock-checkbox"
       
        v-model="inStockOnly"
      />
      <label for="stock-checkbox">Show only in-stock items</label>
    </div>
  </div>

  <!-- Validation Message -->
  <div
    v-if="showValidation"
   
    class="validation-message"
    aria-live="polite"
  >
    {{ validationMsg }}
  </div>

  <!-- Product Data Table -->
  <table class="data-table">
    <thead>
      <tr>
        <th
          data-sort-key="name"
          role="button"
          tabindex="0"
          aria-label="Sort by Name"
          @click="handleSort('name')"
          @keydown="handleSortKeydown($event, 'name')"
        >
          Name{{ getSortIndicator('name') }}
        </th>
        <th
          data-sort-key="price"
          role="button"
          tabindex="0"
          aria-label="Sort by Price"
          @click="handleSort('price')"
          @keydown="handleSortKeydown($event, 'price')"
        >
          Price{{ getSortIndicator('price') }}
        </th>
        <th
          data-sort-key="category"
          role="button"
          tabindex="0"
          aria-label="Sort by Category"
          @click="handleSort('category')"
          @keydown="handleSortKeydown($event, 'category')"
        >
          Category{{ getSortIndicator('category') }}
        </th>
        <th
          data-sort-key="stock"
          role="button"
          tabindex="0"
          aria-label="Sort by Stock"
          @click="handleSort('stock')"
          @keydown="handleSortKeydown($event, 'stock')"
        >
          Stock{{ getSortIndicator('stock') }}
        </th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody>
      <tr v-if="filteredProducts.length === 0" class="empty-state">
        <td colspan="5">No products found.</td>
      </tr>
      <tr v-for="product in filteredProducts" :key="product.name" v-else>
        <td>
          <button
            class="view-details-btn"
           
            @click="openModal(product)"
          >
            {{ product.name }}
          </button>
        </td>
        <td>${{ product.price.toFixed(2) }}</td>
        <td>{{ product.category }}</td>
        <td>{{ product.inStock ? 'Yes' : 'No' }}</td>
        <td>
          <button
            class="btn-primary btn-sm"
           
            @click="addToCart(product)"
          >
            Add to Cart
          </button>
        </td>
      </tr>
    </tbody>
  </table>

  <!-- Order Controls -->
  <div class="order-controls">
    <!-- Quantity Stepper -->
    <fieldset class="control-group">
      <legend>Quantity</legend>
      <div class="stepper">
        <button
         
          aria-label="Decrease quantity"
          :disabled="quantity <= 1"
          @click="quantity = Math.max(1, quantity - 1)"
        >
          −
        </button>
        <input
          type="number"
         
          id="quantity-input"
          :value="quantity"
          min="1"
          max="99"
          readonly
          aria-label="Quantity"
        />
        <button
         
          aria-label="Increase quantity"
          :disabled="quantity >= 99"
          @click="quantity = Math.min(99, quantity + 1)"
        >
          +
        </button>
      </div>
    </fieldset>

    <!-- Shipping Radio Group -->
    <fieldset class="control-group radio-group">
      <legend>Shipping Method</legend>
      <label v-for="(info, key) in SHIPPING" :key="key">
        <input
          type="radio"
          name="shipping"
          :value="key"
          v-model="shipping"
        />
        {{ ' ' }}{{ info.label }} — <span>${{ info.cost.toFixed(2) }}</span>
      </label>
      <div class="radio-output" aria-live="polite">
        Shipping: ${{ SHIPPING[shipping]?.cost.toFixed(2) }}
      </div>
    </fieldset>

    <!-- Date Picker -->
    <fieldset class="control-group">
      <legend>Delivery Date</legend>
      <label for="delivery-date">Choose a date</label>
      <div>
        <VueDatePicker
          :model-value="deliveryDate"
          @update:model-value="handleDateUpdate"
          placeholder="Select a date"
          :enable-time-picker="false"
          auto-apply
          input-class-name="datepicker-input"
          uid="delivery-date"
        />
      </div>
      <div class="date-output" aria-live="polite">
        {{ formatDate(deliveryDate) }}
      </div>
    </fieldset>
  </div>

  <!-- Action Button + Output -->
  <div class="action-area">
    <button class="btn-primary" @click="handleActionButton">
      Add to Cart
    </button>
    <div class="action-output" aria-live="polite">
      {{ actionOutput }}
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
    <div aria-live="polite">{{ delayedText }}</div>
  </div>

  <!-- Modal -->
  <dialog
    v-if="modalProduct"
    ref="modalRef"
   
    class="modal"
    @click="handleModalBackdropClick"
  >
    <div class="modal-content">
      <h2>{{ modalProduct.name }}</h2>
      <p>
        {{ modalProduct.name }} — ${{ modalProduct.price.toFixed(2) }} | Category:
        {{ modalProduct.category }} |
        {{ modalProduct.inStock ? 'In Stock' : 'Out of Stock' }}
      </p>
      <button
       
        class="btn-secondary"
        aria-label="Close dialog"
        @click="closeModal"
      >
        Close
      </button>
    </div>
  </dialog>

  <!-- Toast -->
  <div
    v-if="toast.visible.value"
   
    class="toast"
    role="status"
    aria-live="polite"
  >
    {{ toast.message.value }}
  </div>
</template>
