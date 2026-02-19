// ===== PRODUCT DATA (Canonical — shared across all 8 apps) =====
const PRODUCTS = [
  { name: 'Wireless Mouse',      price: 29.99,  category: 'Electronics', inStock: true },
  { name: 'Bluetooth Keyboard',  price: 49.99,  category: 'Electronics', inStock: true },
  { name: 'USB-C Hub',           price: 39.99,  category: 'Electronics', inStock: false },
  { name: 'Running Shoes',       price: 89.99,  category: 'Clothing',    inStock: true },
  { name: 'Winter Jacket',       price: 129.99, category: 'Clothing',    inStock: false },
  { name: 'Cooking Basics',      price: 24.99,  category: 'Books',       inStock: true },
  { name: 'Science Fiction Novel', price: 14.99, category: 'Books',       inStock: true },
];

const SHIPPING = {
  standard:  { label: 'Standard',  cost: 4.99 },
  express:   { label: 'Express',   cost: 9.99 },
  overnight: { label: 'Overnight', cost: 19.99 },
};

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
  const searchTerm = searchInput.value.toLowerCase().trim();
  const category   = categorySelect.value;
  const inStockOnly = stockCheckbox.checked;

  let filtered = PRODUCTS.filter(p => {
    // Text filter — name only, case-insensitive, substring
    if (searchTerm && !p.name.toLowerCase().includes(searchTerm)) return false;
    // Category filter
    if (category !== 'All' && p.category !== category) return false;
    // In-stock filter
    if (inStockOnly && !p.inStock) return false;
    return true;
  });

  // Sort
  if (sortKey) {
    filtered.sort((a, b) => {
      let valA = a[sortKey];
      let valB = b[sortKey];

      // Normalize for comparison
      if (typeof valA === 'string') {
        valA = valA.toLowerCase();
        valB = valB.toLowerCase();
      }
      // Booleans: true > false for ascending
      if (typeof valA === 'boolean') {
        valA = valA ? 1 : 0;
        valB = valB ? 1 : 0;
      }

      if (valA < valB) return sortAsc ? -1 : 1;
      if (valA > valB) return sortAsc ? 1 : -1;
      return 0;
    });
  }

  return filtered;
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

  if (sortKey === key) {
    // Toggle: asc → desc → asc (no neutral)
    sortAsc = !sortAsc;
  } else {
    sortKey = key;
    sortAsc = true;
  }

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
  if (datePicker.value) {
    const date = new Date(datePicker.value + 'T00:00:00');
    const formatted = date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    dateOutput.textContent = formatted;
  } else {
    dateOutput.textContent = '';
  }
});

// ===== ADD TO CART (Action Button) =====
function addToCart(product) {
  const qty = parseInt(quantityInput.value, 10);
  const msg = `Added ${qty}x ${product.name} to cart`;

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
  }, 3000);
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
