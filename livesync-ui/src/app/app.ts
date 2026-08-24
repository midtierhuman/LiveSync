import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from './services/auth.service';
import { ToastService } from './services/toast.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, MatIconModule],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly title = 'LiveSync';
  private readonly authService = inject(AuthService);
  readonly toastService = inject(ToastService);

  constructor() {
    // AuthService automatically initializes and checks for stored token
    // Guards will wait for initialization before allowing navigation
  }
}
