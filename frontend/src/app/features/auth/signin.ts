import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-signin',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './signin.html',
  styleUrl: './signin.scss',
})
export class SignIn {
  protected readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  emailOrUsername = signal('');
  password = signal('');
  errorMessage = signal('');
  hidePassword = signal(true);

  async onSignIn(): Promise<void> {
    this.errorMessage.set('');

    if (!this.emailOrUsername() || !this.password()) {
      this.errorMessage.set('Please fill in all fields');
      return;
    }

    const success = await this.authService.signin(this.emailOrUsername(), this.password());

    if (success) {
      this.router.navigate(['/dashboard']);
    } else {
      this.errorMessage.set('Invalid email or password');
    }
  }

  togglePasswordVisibility(): void {
    this.hidePassword.set(!this.hidePassword());
  }
}
