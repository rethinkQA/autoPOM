'use client';

import { useState, useEffect, useCallback } from 'react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import {
  TextField,
  Select, MenuItem, FormControl, InputLabel,
  Checkbox, FormControlLabel,
  Radio, RadioGroup,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, TableSortLabel,
  Dialog, DialogContent,
} from '@mui/material';
import { PRODUCTS, CATEGORIES, SHIPPING, type Product } from '@shared/data';
import {
  filterAndSortProducts, toggleSort, cartMessage, formatDate,
  TOAST_DURATION_MS, type SortKey,
} from '@shared/logic';

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'price', label: 'Price' },
  { key: 'category', label: 'Category' },
  { key: 'inStock', label: 'Stock' },
];

export default function HomePage() {
  // ===== Filter state =====
  const [searchTerm, setSearchTerm] = useState('');
  const [category, setCategory] = useState('All');
  const [inStockOnly, setInStockOnly] = useState(false);

  // ===== Sort state =====
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortAsc, setSortAsc] = useState(true);

  // ===== Interactive state =====
  const [quantity, setQuantity] = useState(1);
  const [shipping, setShipping] = useState('standard');
  const [deliveryDate, setDeliveryDate] = useState<Date | null>(null);
  const [actionOutput, setActionOutput] = useState('');
  const [validationMsg, setValidationMsg] = useState('');
  const [showValidation, setShowValidation] = useState(false);

  // ===== Toast =====
  const [toastMsg, setToastMsg] = useState('');
  const [showToast, setShowToast] = useState(false);

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
    if (!showToast) return;
    const timer = setTimeout(() => setShowToast(false), TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [showToast]);

  // ===== Filtering + Sorting =====
  const filteredProducts = useCallback(
    () => filterAndSortProducts(PRODUCTS, { searchTerm, category, inStockOnly }, { key: sortKey, ascending: sortAsc }),
    [searchTerm, category, inStockOnly, sortKey, sortAsc],
  )();

  // ===== Handlers =====
  function handleSort(key: SortKey) {
    const next = toggleSort({ key: sortKey, ascending: sortAsc }, key);
    setSortKey(next.key);
    setSortAsc(next.ascending);
  }

  function showToastMessage(msg: string) {
    setToastMsg(msg);
    setShowToast(true);
  }

  function addToCart(product: Product) {
    const msg = cartMessage(quantity, product.name);
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

  function openModal(product: Product) {
    setModalProduct(product);
  }

  function closeModal() {
    setModalProduct(null);
  }

  return (
    <>
      {/* Filter Controls (MUI) */}
      <div className="filter-bar">
        <TextField
          label="Search Products"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyDown={handleSearchKeyDown}
          placeholder="Search by name…"
          variant="outlined"
          size="small"
          className="filter-group"
        />

        <FormControl variant="outlined" size="small" className="filter-group" sx={{ minWidth: 180 }}>
          <InputLabel id="category-label">Category</InputLabel>
          <Select
            labelId="category-label"
            value={category}
            label="Category"
            onChange={(e) => setCategory(e.target.value)}
          >
            {CATEGORIES.map((c) => (
              <MenuItem key={c} value={c}>{c}</MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControlLabel
          control={
            <Checkbox
              checked={inStockOnly}
              onChange={(e) => setInStockOnly(e.target.checked)}
            />
          }
          label="Show only in-stock items"
          className="filter-checkbox"
        />
      </div>

      {/* Validation Message */}
      {showValidation && (
        <div className="validation-message" aria-live="polite">
          {validationMsg}
        </div>
      )}

      {/* Product Data Table (MUI Table + TableSortLabel) */}
      <TableContainer component={Paper} className="data-table">
        <Table>
          <TableHead>
            <TableRow>
              {COLUMNS.map(({ key, label }) => (
                <TableCell
                  key={key}
                  sortDirection={sortKey === key ? (sortAsc ? 'asc' : 'desc') : false}
                  onClick={() => handleSort(key)}
                  sx={{ cursor: 'pointer' }}
                >
                  <TableSortLabel
                    active={sortKey === key}
                    direction={sortKey === key ? (sortAsc ? 'asc' : 'desc') : 'asc'}
                  >
                    {label}
                  </TableSortLabel>
                </TableCell>
              ))}
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredProducts.length === 0 ? (
              <TableRow className="empty-state">
                <TableCell colSpan={5} align="center">No products found.</TableCell>
              </TableRow>
            ) : (
              filteredProducts.map((product) => (
                <TableRow key={product.name} hover>
                  <TableCell>
                    <button className="view-details-btn" onClick={() => openModal(product)}>
                      {product.name}
                    </button>
                  </TableCell>
                  <TableCell>${product.price.toFixed(2)}</TableCell>
                  <TableCell>{product.category}</TableCell>
                  <TableCell>{product.inStock ? 'Yes' : 'No'}</TableCell>
                  <TableCell>
                    <button className="btn-primary btn-sm" onClick={() => addToCart(product)}>
                      Add to Cart
                    </button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

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

        {/* Shipping Radio Group (MUI) */}
        <fieldset className="control-group">
          <legend>Shipping Method</legend>
          <RadioGroup value={shipping} onChange={(e) => setShipping(e.target.value)} aria-label="Shipping Method">
            {Object.entries(SHIPPING).map(([key, { label, cost }]) => (
              <FormControlLabel
                key={key}
                value={key}
                control={<Radio />}
                label={`${label} — $${cost.toFixed(2)}`}
              />
            ))}
          </RadioGroup>
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

      {/* Modal (MUI Dialog) */}
      <Dialog open={!!modalProduct} onClose={closeModal}>
        <DialogContent className="modal-content">
          <h2>{modalProduct?.name}</h2>
          <p>
            {modalProduct?.name} — ${modalProduct?.price.toFixed(2)} | Category: {modalProduct?.category} | {modalProduct?.inStock ? 'In Stock' : 'Out of Stock'}
          </p>
          <button className="btn-secondary" aria-label="Close dialog" onClick={closeModal}>
            Close
          </button>
        </DialogContent>
      </Dialog>

      {/* Toast (UI contract selector: .toast[aria-live='polite']) */}
      {showToast && (
        <div className="toast" role="status" aria-live="polite">
          {toastMsg}
        </div>
      )}
    </>
  );
}
