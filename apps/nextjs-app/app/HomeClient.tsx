'use client';

import { useState, useEffect, useCallback } from 'react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import toast, { Toaster } from 'react-hot-toast';
import { PRODUCTS, CATEGORIES, SHIPPING, type Product } from './data';

type SortKey = 'name' | 'price' | 'category' | 'stock' | null;

export default function HomePage() {
  // ===== Filter state =====
  const [searchTerm, setSearchTerm] = useState('');
  const [category, setCategory] = useState('All');
  const [inStockOnly, setInStockOnly] = useState(false);

  // ===== Sort state =====
  const [sortKey, setSortKey] = useState<SortKey>(null);
  const [sortAsc, setSortAsc] = useState(true);

  // ===== Interactive state =====
  const [quantity, setQuantity] = useState(1);
  const [shipping, setShipping] = useState('standard');
  const [deliveryDate, setDeliveryDate] = useState<Date | null>(null);
  const [actionOutput, setActionOutput] = useState('');
  const [validationMsg, setValidationMsg] = useState('');
  const [showValidation, setShowValidation] = useState(false);

  // ===== Toast =====
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMsg, setToastMsg] = useState('');

  // ===== Modal =====
  const [modalProduct, setModalProduct] = useState<Product | null>(null);

  // ===== Delayed content =====
  const [delayedText, setDelayedText] = useState('Loading recommendations…');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDelayedText('You might also like: USB-C Hub, Winter Jacket, Cooking Basics');
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  // ===== Toast auto-dismiss =====
  useEffect(() => {
    if (!toastVisible) return;
    const timer = setTimeout(() => setToastVisible(false), 3000);
    return () => clearTimeout(timer);
  }, [toastVisible]);

  // ===== Filtering + Sorting =====
  const getFilteredProducts = useCallback(() => {
    let filtered = PRODUCTS.filter((p) => {
      if (searchTerm && !p.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      if (category !== 'All' && p.category !== category) return false;
      if (inStockOnly && !p.inStock) return false;
      return true;
    });

    if (sortKey) {
      filtered = [...filtered].sort((a, b) => {
        let valA: string | number | boolean;
        let valB: string | number | boolean;

        switch (sortKey) {
          case 'name':     valA = a.name.toLowerCase(); valB = b.name.toLowerCase(); break;
          case 'price':    valA = a.price; valB = b.price; break;
          case 'category': valA = a.category.toLowerCase(); valB = b.category.toLowerCase(); break;
          case 'stock':    valA = a.inStock ? 1 : 0; valB = b.inStock ? 1 : 0; break;
        }

        if (valA < valB) return sortAsc ? -1 : 1;
        if (valA > valB) return sortAsc ? 1 : -1;
        return 0;
      });
    }

    return filtered;
  }, [searchTerm, category, inStockOnly, sortKey, sortAsc]);

  const filteredProducts = getFilteredProducts();

  // ===== Handlers =====
  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  }

  function getSortIndicator(key: string) {
    if (sortKey !== key) return ' ⇅';
    return sortAsc ? ' ▲' : ' ▼';
  }

  function showToastMessage(msg: string) {
    setToastMsg(msg);
    setToastVisible(true);
    toast(msg);
  }

  function addToCart(product: Product) {
    const msg = `Added ${quantity}x ${product.name} to cart`;
    setActionOutput(msg);
    showToastMessage(msg);
  }

  function handleActionButton() {
    if (filteredProducts.length === 0) {
      setValidationMsg('Please enter a search term');
      setShowValidation(true);
      return;
    }
    setShowValidation(false);
    addToCart(filteredProducts[0]);
  }

  function handleSearchKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      if (!searchTerm.trim()) {
        setValidationMsg('Please enter a search term');
        setShowValidation(true);
      } else {
        setShowValidation(false);
      }
    }
  }

  function formatDate(date: Date | null): string {
    if (!date) return '';
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  function openModal(product: Product) {
    setModalProduct(product);
  }

  function closeModal() {
    setModalProduct(null);
  }

  return (
    <>
      <Toaster position="bottom-right" />

      {/* Filter Controls */}
      <div className="filter-bar">
        <div className="filter-group">
          <label htmlFor="search-input">Search Products</label>
          <input
            type="text"
            id="search-input"
           
            placeholder="Search by name…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={handleSearchKeyDown}
          />
        </div>
        <div className="filter-group">
          <label htmlFor="category-select">Category</label>
          <select
            id="category-select"
           
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="filter-group filter-checkbox">
          <input
            type="checkbox"
            id="stock-checkbox"
           
            checked={inStockOnly}
            onChange={(e) => setInStockOnly(e.target.checked)}
          />
          <label htmlFor="stock-checkbox">Show only in-stock items</label>
        </div>
      </div>

      {/* Validation Message */}
      {showValidation && (
        <div className="validation-message" aria-live="polite">
          {validationMsg}
        </div>
      )}

      {/* Product Data Table */}
      <table className="data-table">
        <thead>
          <tr>
            <th role="button" tabIndex={0} data-sort-key="name" aria-label="Sort by Name"
                onClick={() => handleSort('name')} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSort('name'); }}}>
              Name{getSortIndicator('name')}
            </th>
            <th role="button" tabIndex={0} data-sort-key="price" aria-label="Sort by Price"
                onClick={() => handleSort('price')} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSort('price'); }}}>
              Price{getSortIndicator('price')}
            </th>
            <th role="button" tabIndex={0} data-sort-key="category" aria-label="Sort by Category"
                onClick={() => handleSort('category')} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSort('category'); }}}>
              Category{getSortIndicator('category')}
            </th>
            <th role="button" tabIndex={0} data-sort-key="stock" aria-label="Sort by Stock"
                onClick={() => handleSort('stock')} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSort('stock'); }}}>
              Stock{getSortIndicator('stock')}
            </th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {filteredProducts.length === 0 ? (
            <tr className="empty-state">
              <td colSpan={5}>No products found.</td>
            </tr>
          ) : (
            filteredProducts.map((product) => (
              <tr key={product.name}>
                <td>
                  <button className="view-details-btn"
                          onClick={() => openModal(product)}>
                    {product.name}
                  </button>
                </td>
                <td>${product.price.toFixed(2)}</td>
                <td>{product.category}</td>
                <td>{product.inStock ? 'Yes' : 'No'}</td>
                <td>
                  <button className="btn-primary btn-sm"
                          onClick={() => addToCart(product)}>
                    Add to Cart
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {/* Order Controls */}
      <div className="order-controls">
        {/* Quantity Stepper */}
        <fieldset className="control-group">
          <legend>Quantity</legend>
          <div className="stepper">
            <button aria-label="Decrease quantity"
                    disabled={quantity <= 1} onClick={() => setQuantity((q) => Math.max(1, q - 1))}>−</button>
            <input type="number" id="quantity-input"
                   value={quantity} min={1} max={99} readOnly aria-label="Quantity" />
            <button aria-label="Increase quantity"
                    disabled={quantity >= 99} onClick={() => setQuantity((q) => Math.min(99, q + 1))}>+</button>
          </div>
        </fieldset>

        {/* Shipping Radio Group */}
        <fieldset className="control-group radio-group">
          <legend>Shipping Method</legend>
          {Object.entries(SHIPPING).map(([key, { label, cost }]) => (
            <label key={key}>
              <input type="radio" name="shipping" value={key}
                     checked={shipping === key} onChange={() => setShipping(key)} />
              {' '}{label} — <span>${cost.toFixed(2)}</span>
            </label>
          ))}
          <div className="radio-output" aria-live="polite">
            Shipping: ${SHIPPING[shipping].cost.toFixed(2)}
          </div>
        </fieldset>

        {/* Date Picker */}
        <fieldset className="control-group">
          <legend>Delivery Date</legend>
          <label htmlFor="delivery-date">Choose a date</label>
          <div>
            <DatePicker
              id="delivery-date"
              selected={deliveryDate}
              onChange={(date: Date | null) => setDeliveryDate(date)}
              placeholderText="Select a date"
              dateFormat="MM/dd/yyyy"
              className="datepicker-input"
            />
          </div>
          <div className="date-output" aria-live="polite">
            {formatDate(deliveryDate)}
          </div>
        </fieldset>
      </div>

      {/* Action Button + Output */}
      <div className="action-area">
        <button className="btn-primary" onClick={handleActionButton}>
          Add to Cart
        </button>
        <div className="action-output" aria-live="polite">
          {actionOutput}
        </div>
      </div>

      {/* Item List */}
      <div className="section">
        <h2>Popular Items</h2>
        <ul className="item-list">
          <li>Wireless Mouse</li>
          <li>Bluetooth Keyboard</li>
          <li>Running Shoes</li>
        </ul>
      </div>

      {/* Delayed Content */}
      <div className="section">
        <h2>Recommendations</h2>
        <div aria-live="polite">{delayedText}</div>
      </div>

      {/* Modal */}
      {modalProduct && (
        <dialog className="modal" open
                onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
          <div className="modal-content">
            <h2>{modalProduct.name}</h2>
            <p>
              {modalProduct.name} — ${modalProduct.price.toFixed(2)} | Category: {modalProduct.category} | {modalProduct.inStock ? 'In Stock' : 'Out of Stock'}
            </p>
            <button className="btn-secondary" aria-label="Close dialog"
                    onClick={closeModal}>
              Close
            </button>
          </div>
        </dialog>
      )}

      {/* Toast (custom element — react-hot-toast also renders its own toasts) */}
      {toastVisible && (
        <div className="toast" role="status" aria-live="polite">
          {toastMsg}
        </div>
      )}
    </>
  );
}
