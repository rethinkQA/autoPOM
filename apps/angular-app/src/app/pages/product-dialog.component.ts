import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { Product } from '@shared/data';

@Component({
  selector: 'app-product-dialog',
  standalone: true,
  imports: [MatDialogModule],
  template: `
    <div class="modal-content">
      <h2>{{ data.name }}</h2>
      <p>
        {{ data.name }} — \${{ data.price.toFixed(2) }} |
        Category: {{ data.category }} |
        {{ data.inStock ? 'In Stock' : 'Out of Stock' }}
      </p>
      <button class="btn-secondary" aria-label="Close dialog"
              (click)="close()">
        Close
      </button>
    </div>
  `,
  styles: [`
    .modal-content {
      padding: 2rem;
    }
    .modal-content h2 {
      margin-bottom: 1rem;
      color: #2c3e50;
    }
    .modal-content p {
      margin-bottom: 1.5rem;
      color: #555;
      line-height: 1.6;
    }
    .btn-secondary {
      background: #95a5a6;
      color: #fff;
      border: none;
      padding: 0.5rem 1.2rem;
      border-radius: 6px;
      font-size: 0.9rem;
      cursor: pointer;
      transition: background 0.2s;
    }
    .btn-secondary:hover {
      background: #7f8c8d;
    }
  `],
})
export class ProductDialogComponent {
  constructor(
    public dialogRef: MatDialogRef<ProductDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: Product,
  ) {}

  close(): void {
    this.dialogRef.close();
  }
}
