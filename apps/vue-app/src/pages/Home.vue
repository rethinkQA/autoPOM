<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { VueDatePicker } from '@vuepic/vue-datepicker';
import '@vuepic/vue-datepicker/dist/main.css';
import { useToast } from '../composables/useToast';
import { PRODUCTS, CATEGORIES, SHIPPING, type Product } from '@shared/data';
import {
  filterProducts, cartMessage,
  formatDate as sharedFormatDate,
} from '@shared/logic';

// ===== Filter state =====
const searchTerm = ref('');
const category = ref('All');
const inStockOnly = ref(false);

// ===== Interactive state =====
const quantity = ref(1);
const shipping = ref('standard');
const deliveryDate = ref<Date | null>(null);
const actionOutput = ref('');
const validationMsg = ref('');
const showValidation = ref(false);

// ===== Modal =====
const modalProduct = ref<Product | null>(null);
const dialogOpen = ref(false);

// ===== Snackbar (removed duplicate — using inline toast only) =====

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

// ===== v-data-table headers =====
const headers = [
  { title: 'Name', key: 'name', sortable: true },
  { title: 'Price', key: 'price', sortable: true },
  { title: 'Category', key: 'category', sortable: true },
  { title: 'Stock', key: 'inStock', sortable: true },
  { title: 'Actions', key: 'actions', sortable: false },
];

// ===== Filtering =====
const filteredProducts = computed(() => {
  return filterProducts(PRODUCTS, {
    searchTerm: searchTerm.value,
    category: category.value,
    inStockOnly: inStockOnly.value,
  });
});

// ===== Handlers =====
function showToastMessage(msg: string) {
  toast.show(msg);
}

function addToCart(product: Product) {
  const msg = cartMessage(quantity.value, product.name);
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
  return sharedFormatDate(date);
}

function openModal(product: Product) {
  modalProduct.value = product;
  dialogOpen.value = true;
}

function closeModal() {
  dialogOpen.value = false;
  modalProduct.value = null;
}

function handleDateUpdate(date: Date | null) {
  deliveryDate.value = date;
}
</script>

<template>
  <!-- Filter Controls (Vuetify) -->
  <div class="filter-bar">
    <v-text-field
      v-model="searchTerm"
      label="Search Products"
      placeholder="Search by name…"
      variant="outlined"
      density="compact"
      class="filter-group"
      @keydown="handleSearchKeydown"
    />

    <v-select
      v-model="category"
      :items="CATEGORIES"
      label="Category"
      variant="outlined"
      density="compact"
      class="filter-group"
    />

    <v-checkbox
      v-model="inStockOnly"
      label="Show only in-stock items"
      class="filter-checkbox"
      density="compact"
      hide-details
    />
  </div>

  <!-- Validation Message -->
  <div
    v-if="showValidation"
    class="validation-message"
    aria-live="polite"
  >
    {{ validationMsg }}
  </div>

  <!-- Product Data Table (Vuetify v-data-table) -->
  <v-data-table
    :headers="headers"
    :items="filteredProducts"
    :items-per-page="-1"
    class="data-table elevation-1"
  >
    <template v-slot:item.name="{ item }">
      <button class="view-details-btn" @click="openModal(item)">{{ item.name }}</button>
    </template>
    <template v-slot:item.price="{ item }">
      ${{ item.price.toFixed(2) }}
    </template>
    <template v-slot:item.inStock="{ item }">
      {{ item.inStock ? 'Yes' : 'No' }}
    </template>
    <template v-slot:item.actions="{ item }">
      <button class="btn-primary btn-sm" @click="addToCart(item)">Add to Cart</button>
    </template>
    <template v-slot:no-data>
      <tr class="empty-state"><td :colspan="headers.length">No products found.</td></tr>
    </template>
    <template v-slot:bottom></template>
  </v-data-table>

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
        >−</button>
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
        >+</button>
      </div>
    </fieldset>

    <!-- Shipping Radio Group (Vuetify) -->
    <fieldset class="control-group">
      <legend>Shipping Method</legend>
      <v-radio-group v-model="shipping" aria-label="Shipping Method" hide-details>
        <v-radio
          v-for="(info, key) in SHIPPING"
          :key="key"
          :label="`${info.label} — $${info.cost.toFixed(2)}`"
          :value="key"
        />
      </v-radio-group>
      <div class="radio-output" aria-live="polite">
        Shipping: ${{ SHIPPING[shipping]?.cost.toFixed(2) }}
      </div>
    </fieldset>

    <!-- Date Picker (vue-datepicker — already library component) -->
    <fieldset class="control-group">
      <legend>Delivery Date</legend>
      <label>Choose a date</label>
      <div>
        <VueDatePicker
          :model-value="deliveryDate"
          @update:model-value="handleDateUpdate"
          placeholder="Select a date"
          :enable-time-picker="false"
          auto-apply
          input-class-name="datepicker-input"
          uid="delivery-date"
          :aria-labels="{ input: 'Choose a date' }"
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

  <!-- Modal (Vuetify v-dialog) -->
  <v-dialog v-model="dialogOpen" max-width="450">
    <v-card v-if="modalProduct">
      <v-card-text class="modal-content">
        <h2>{{ modalProduct.name }}</h2>
        <p>
          {{ modalProduct.name }} — ${{ modalProduct.price.toFixed(2) }} | Category:
          {{ modalProduct.category }} |
          {{ modalProduct.inStock ? 'In Stock' : 'Out of Stock' }}
        </p>
        <button class="btn-secondary" aria-label="Close dialog" @click="closeModal">
          Close
        </button>
      </v-card-text>
    </v-card>
  </v-dialog>

  <!-- Toast (UI contract selector: .toast[aria-live='polite']) -->
  <div
    v-if="toast.visible.value"
    class="toast"
    role="status"
    aria-live="polite"
  >
    {{ toast.message.value }}
  </div>
</template>
