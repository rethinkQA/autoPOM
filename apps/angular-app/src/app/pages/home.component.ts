import { Component, OnInit, OnDestroy, inject, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormControl } from '@angular/forms';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatRadioModule } from '@angular/material/radio';
import { MatTableModule } from '@angular/material/table';
import { MatSortModule, Sort } from '@angular/material/sort';
import { PRODUCTS, CATEGORIES, SHIPPING, type Product } from '@shared/data';
import {
  filterAndSortProducts, cartMessage, formatDate,
  TOAST_DURATION_MS, type SortKey,
} from '@shared/logic';
import { ProductDialogComponent } from './product-dialog.component';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatSnackBarModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    MatRadioModule,
    MatTableModule,
    MatSortModule,
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
  readonly displayedColumns = ['name', 'price', 'category', 'inStock', 'actions'];

  // Reactive Form Controls
  searchControl = new FormControl('');
  categoryControl = new FormControl('All');
  inStockControl = new FormControl(false);
  shippingControl = new FormControl('standard');
  dateControl = new FormControl<Date | null>(null);

  // Sort state
  sortKey: SortKey | null = null;
  sortAsc = true;

  // Interactive state
  quantity = 1;
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
    const searchTerm = this.searchControl.value || '';
    const selectedCategory = this.categoryControl.value || 'All';
    const inStockOnly = this.inStockControl.value || false;

    return filterAndSortProducts(
      PRODUCTS,
      { searchTerm, category: selectedCategory, inStockOnly },
      { key: this.sortKey, ascending: this.sortAsc },
    );
  }

  get shippingCost(): string {
    const key = this.shippingControl.value || 'standard';
    return `$${SHIPPING[key].cost.toFixed(2)}`;
  }

  get formattedDate(): string {
    return formatDate(this.dateControl.value);
  }

  // ===== Handlers =====
  handleMatSort(sort: Sort): void {
    if (!sort.active || sort.direction === '') {
      this.sortKey = null;
      this.sortAsc = true;
    } else {
      this.sortKey = sort.active as SortKey;
      this.sortAsc = sort.direction === 'asc';
    }
  }

  increment(): void {
    if (this.quantity < 99) this.quantity++;
  }

  decrement(): void {
    if (this.quantity > 1) this.quantity--;
  }

  addToCart(product: Product): void {
    const msg = cartMessage(this.quantity, product.name);
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
      const searchTerm = this.searchControl.value || '';
      if (!searchTerm.trim()) {
        this.validationMsg = 'Please enter a search term';
        this.showValidation = true;
      } else {
        this.showValidation = false;
      }
    }
  }

  openModal(product: Product): void {
    this.dialog.open(ProductDialogComponent, {
      data: product,
      width: '450px',
      panelClass: 'product-dialog-panel',
    });
  }

  private showToastMessage(msg: string): void {
    this.snackBar.open(msg, undefined, {
      duration: TOAST_DURATION_MS,
      horizontalPosition: 'end',
      verticalPosition: 'bottom',
      panelClass: ['generalstore-snackbar'],
    });

    this.toastMsg = msg;
    this.showToast = true;
    if (this.toastTimeout) clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      this.showToast = false;
    }, TOAST_DURATION_MS);
  }
}
