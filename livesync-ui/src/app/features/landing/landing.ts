import { Component, inject } from '@angular/core';
import { RouterModule, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [RouterModule, MatButtonModule, MatToolbarModule, MatIconModule],
  templateUrl: './landing.html',
  styleUrl: './landing.scss',
})
export class Landing {
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);

  navigateTo(route: string): void {
    this.router.navigate([route]);
  }

  onFeatureClick(): void {
    if (!this.authService.isAuthenticated()) {
      this.router.navigate(['signin']);
    }
  }
}
