import { Component, OnInit, OnDestroy, inject, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { PRODUCTS, CATEGORIES, SHIPPING, type Product } from '../data';
import { ProductDialogComponent } from './product-dialog.component';

type SortKey = 'name' | 'price' | 'category' | 'stock' | null;

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatSnackBarModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css'],
  encapsulation: ViewEncapsulation.None,
})
export class HomeComponent implements OnInit, OnDestroy {
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);

  // Data
  readonly categories = CATEGORIES;
  readonly shippingOptions = Object.entries(SHIPPING);

  // Filter state
  searchTerm = '';
  selectedCategory = 'All';
  inStockOnly = false;

  // Sort state
  sortKey: SortKey = null;
  sortAsc = true;

  // Interactive state
  quantity = 1;
  selectedShipping = 'standard';
  deliveryDate: Date | null = null;
  actionOutput = '';
  validationMsg = '';
  showValidation = false;

  // Toast
  toastMsg = '';
  showToast = false;
  private toastTimeout: ReturnType<typeof setTimeout> | null = null;

  // Delayed content
  delayedText = 'Loading recommendations…';
  private delayedTimeout: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    this.delayedTimeout = setTimeout(() => {
      this.delayedText = 'You might also like: USB-C Hub, Winter Jacket, Cooking Basics';
    }, 1500);
  }

  ngOnDestroy(): void {
    if (this.delayedTimeout) clearTimeout(this.delayedTimeout);
    if (this.toastTimeout) clearTimeout(this.toastTimeout);
  }

  // ===== Computed =====
  get filteredProducts(): Product[] {
    let filtered = PRODUCTS.filter((p) => {
      if (this.searchTerm && !p.name.toLowerCase().includes(this.searchTerm.toLowerCase())) return false;
      if (this.selectedCategory !== 'All' && p.category !== this.selectedCategory) return false;
      if (this.inStockOnly && !p.inStock) return false;
      return true;
    });

    if (this.sortKey) {
      filtered = [...filtered].sort((a, b) => {
        let valA: string | number;
        let valB: string | number;

        switch (this.sortKey) {
          case 'name':     valA = a.name.toLowerCase(); valB = b.name.toLowerCase(); break;
          case 'price':    valA = a.price; valB = b.price; break;
          case 'category': valA = a.category.toLowerCase(); valB = b.category.toLowerCase(); break;
          case 'stock':    valA = a.inStock ? 1 : 0; valB = b.inStock ? 1 : 0; break;
          default:         valA = 0; valB = 0;
        }

        if (valA < valB) return this.sortAsc ? -1 : 1;
        if (valA > valB) return this.sortAsc ? 1 : -1;
        return 0;
      });
    }

    return filtered;
  }

  get shippingCost(): string {
    return `$${SHIPPING[this.selectedShipping].cost.toFixed(2)}`;
  }

  get formattedDate(): string {
    if (!this.deliveryDate) return '';
    return this.deliveryDate.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  // ===== Handlers =====
  handleSort(key: SortKey): void {
    if (this.sortKey === key) {
      this.sortAsc = !this.sortAsc;
    } else {
      this.sortKey = key;
      this.sortAsc = true;
    }
  }

  getSortIndicator(key: string): string {
    if (this.sortKey !== key) return ' ⇅';
    return this.sortAsc ? ' ▲' : ' ▼';
  }

  increment(): void {
    if (this.quantity < 99) this.quantity++;
  }

  decrement(): void {
    if (this.quantity > 1) this.quantity--;
  }

  addToCart(product: Product): void {
    const msg = `Added ${this.quantity}x ${product.name} to cart`;
    this.actionOutput = msg;
    this.showToastMessage(msg);
  }

  handleActionButton(): void {
    const products = this.filteredProducts;
    if (products.length === 0) {
      this.validationMsg = 'Please enter a search term';
      this.showValidation = true;
      return;
    }
    this.showValidation = false;
    this.addToCart(products[0]);
  }

  handleSearchKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      if (!this.searchTerm.trim()) {
        this.validationMsg = 'Please enter a search term';
        this.showValidation = true;
      } else {
        this.showValidation = false;
      }
    }
  }

  openModal(product: Product): void {
    const dialogRef = this.dialog.open(ProductDialogComponent, {
      data: product,
      width: '450px',
      panelClass: 'product-dialog-panel',
    });
  }

  private showToastMessage(msg: string): void {
    // Use MatSnackBar for technology-native toast
    const snackBarRef = this.snackBar.open(msg, undefined, {
      duration: 3000,
      horizontalPosition: 'end',
      verticalPosition: 'bottom',
      panelClass: ['generalstore-snackbar'],
    });

    // Also show inline toast for UI contract
    this.toastMsg = msg;
    this.showToast = true;
    if (this.toastTimeout) clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      this.showToast = false;
    }, 3000);
  }
}
