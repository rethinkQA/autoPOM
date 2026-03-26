/* global Shared */
// ===== SHARED DATA & LOGIC =====
// Imported from the canonical shared/ TypeScript sources via generated shared.js.
// Do NOT duplicate data or logic here — use Shared.* (e.g. Shared.PRODUCTS).
// To regenerate: node scripts/generate-vanilla-shared.mjs
const { PRODUCTS, SHIPPING, filterAndSortProducts, toggleSort, cartMessage, formatDate, TOAST_DURATION_MS } = Shared;

// ===== STATE =====
let sortKey = null;
let sortAsc = true;

// ===== DOM REFERENCES =====
const searchInput     = document.getElementById('search-input');
const categorySelect  = document.getElementById('category-select');
const stockCheckbox   = document.getElementById('stock-checkbox');
const tbody           = document.getElementById('product-tbody');
const actionButton    = document.getElementById('action-button');
const actionOutput    = document.getElementById('action-output');
const validationMsg   = document.getElementById('validation-message');
const quantityInput   = document.getElementById('quantity-input');
const decrementBtn    = document.getElementById('quantity-decrement');
const incrementBtn    = document.getElementById('quantity-increment');
const radioGroup      = document.getElementById('shipping-group');
const radioOutput     = document.getElementById('radio-output');
const datePicker      = document.getElementById('delivery-date');
const dateOutput      = document.getElementById('date-output');
const modal           = document.getElementById('product-modal');
const modalTitle      = document.getElementById('modal-title');
const modalBody       = document.getElementById('modal-body');
const modalClose      = document.getElementById('modal-close');
const toast           = document.getElementById('toast-notification');
const delayedContent  = document.getElementById('delayed-content');
const navHome         = document.querySelector('a[href="#home"]');
const navAbout        = document.querySelector('a[href="#about"]');

// ===== ROUTING =====
function navigate() {
  const hash = window.location.hash || '#home';
  const homeView  = document.getElementById('view-home');
  const aboutView = document.getElementById('view-about');

  if (hash === '#about') {
    homeView.hidden  = true;
    aboutView.hidden = false;
    navHome.classList.remove('active');
    navAbout.classList.add('active');
  } else {
    homeView.hidden  = false;
    aboutView.hidden = true;
    navHome.classList.add('active');
    navAbout.classList.remove('active');
  }
}

window.addEventListener('hashchange', navigate);

// ===== TABLE RENDERING =====
function getFilteredAndSortedProducts() {
  return filterAndSortProducts(
    PRODUCTS,
    {
      searchTerm: searchInput.value,
      category:   categorySelect.value,
      inStockOnly: stockCheckbox.checked,
    },
    { key: sortKey, ascending: sortAsc },
  );
}

function renderTable() {
  const products = getFilteredAndSortedProducts();
  tbody.innerHTML = '';

  if (products.length === 0) {
    const tr = document.createElement('tr');
    tr.classList.add('empty-state');
    const td = document.createElement('td');
    td.colSpan = 5;
    td.textContent = 'No products found.';
    td.classList.add('empty-state');
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  products.forEach(product => {
    const tr = document.createElement('tr');

    // Name cell with modal trigger
    const nameTd = document.createElement('td');
    const triggerBtn = document.createElement('button');
    triggerBtn.classList.add('view-details-btn');
    triggerBtn.textContent = product.name;
    triggerBtn.addEventListener('click', () => openModal(product));
    nameTd.appendChild(triggerBtn);
    tr.appendChild(nameTd);

    // Price
    const priceTd = document.createElement('td');
    priceTd.textContent = `$${product.price.toFixed(2)}`;
    tr.appendChild(priceTd);

    // Category
    const catTd = document.createElement('td');
    catTd.textContent = product.category;
    tr.appendChild(catTd);

    // Stock
    const stockTd = document.createElement('td');
    stockTd.textContent = product.inStock ? 'Yes' : 'No';
    tr.appendChild(stockTd);

    // Actions — Add to Cart
    const actionTd = document.createElement('td');
    const addBtn = document.createElement('button');
    addBtn.classList.add('btn-primary');
    addBtn.style.fontSize = '0.8rem';
    addBtn.style.padding = '0.3rem 0.8rem';
    addBtn.textContent = 'Add to Cart';
    addBtn.addEventListener('click', () => addToCart(product));
    actionTd.appendChild(addBtn);
    tr.appendChild(actionTd);

    tbody.appendChild(tr);
  });
}

// ===== SORTING =====
function setupSorting() {
  const headers = document.querySelectorAll('th[data-sort-key]');
  headers.forEach(th => {
    th.addEventListener('click', () => handleSort(th));
    th.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleSort(th);
      }
    });
  });
}

function handleSort(th) {
  const key = th.dataset.sortKey;
  const headers = document.querySelectorAll('th[data-sort-key]');

  const next = toggleSort({ key: sortKey, ascending: sortAsc }, key);
  sortKey = next.key;
  sortAsc = next.ascending;

  // Update header classes
  headers.forEach(h => {
    h.classList.remove('sort-asc', 'sort-desc');
  });
  th.classList.add(sortAsc ? 'sort-asc' : 'sort-desc');

  renderTable();
}

// ===== FILTERING =====
searchInput.addEventListener('input', renderTable);
categorySelect.addEventListener('change', renderTable);
stockCheckbox.addEventListener('change', renderTable);

// ===== QUANTITY STEPPER =====
function updateStepperState() {
  const val = parseInt(quantityInput.value, 10);
  decrementBtn.disabled = val <= 1;
  incrementBtn.disabled = val >= 99;
}

decrementBtn.addEventListener('click', () => {
  const val = parseInt(quantityInput.value, 10);
  if (val > 1) {
    quantityInput.value = val - 1;
    updateStepperState();
  }
});

incrementBtn.addEventListener('click', () => {
  const val = parseInt(quantityInput.value, 10);
  if (val < 99) {
    quantityInput.value = val + 1;
    updateStepperState();
  }
});

// ===== SHIPPING RADIO =====
radioGroup.addEventListener('change', (e) => {
  if (e.target.type === 'radio') {
    const selected = SHIPPING[e.target.value];
    radioOutput.textContent = `Shipping: $${selected.cost.toFixed(2)}`;
  }
});

// ===== DATE PICKER =====
datePicker.addEventListener('change', () => {
  const date = datePicker.value ? new Date(datePicker.value + 'T00:00:00') : null;
  dateOutput.textContent = formatDate(date);
});

// ===== ADD TO CART (Action Button) =====
function addToCart(product) {
  const qty = parseInt(quantityInput.value, 10);
  const msg = cartMessage(qty, product.name);

  // Update output display
  actionOutput.textContent = msg;

  // Show toast
  showToast(msg);
}

// Main action button (outside table) — validates search input then adds first visible product
actionButton.addEventListener('click', () => {
  const products = getFilteredAndSortedProducts();

  if (products.length === 0) {
    validationMsg.textContent = 'Please enter a search term';
    validationMsg.hidden = false;
    return;
  }

  validationMsg.hidden = true;
  addToCart(products[0]);
});

// ===== MODAL =====
function openModal(product) {
  modalTitle.textContent = product.name;
  modalBody.textContent = `${product.name} — $${product.price.toFixed(2)} | Category: ${product.category} | ${product.inStock ? 'In Stock' : 'Out of Stock'}`;
  modal.showModal();
}

modalClose.addEventListener('click', () => {
  modal.close();
});

// Close on backdrop click
modal.addEventListener('click', (e) => {
  if (e.target === modal) {
    modal.close();
  }
});

// ===== TOAST =====
let toastTimeout = null;
function showToast(message) {
  toast.textContent = message;
  toast.hidden = false;

  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.hidden = true;
  }, TOAST_DURATION_MS);
}

// ===== DELAYED CONTENT =====
setTimeout(() => {
  delayedContent.textContent = 'You might also like: USB-C Hub, Winter Jacket, Cooking Basics';
}, 1500);

// ===== FORM VALIDATION (on Enter in search) =====
searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    if (!searchInput.value.trim()) {
      validationMsg.textContent = 'Please enter a search term';
      validationMsg.hidden = false;
    } else {
      validationMsg.hidden = true;
    }
  }
});

// ===== INIT =====
navigate();
setupSorting();
renderTable();
updateStepperState();
