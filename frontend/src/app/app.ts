import { Component, inject } from '@angular/core';
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
    // AuthService automatically initializes and checks for stored token
    // Guards will wait for initialization before allowing navigation
  }
}
