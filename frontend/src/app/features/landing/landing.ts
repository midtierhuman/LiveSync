import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [CommonModule, RouterModule, MatButtonModule, MatToolbarModule, MatIconModule],
  templateUrl: './landing.html',
  styleUrl: './landing.scss',
})
export class Landing {
  private readonly router = inject(Router);

  navigateTo(route: string): void {
    this.router.navigate([route]);
  }
}
