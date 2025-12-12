import { Component, effect, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthService } from './services/auth.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly title = 'LiveSync';
  private readonly authService = inject(AuthService);

  constructor() {
    // Initialize authentication on app startup
    this.authService.initializeAuth();
  }
}
