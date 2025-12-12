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
  selector: 'app-signup',
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
  templateUrl: './signup.html',
  styleUrl: './signup.scss',
})
export class SignUp {
  protected readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  username = signal('');
  email = signal('');
  password = signal('');
  confirmPassword = signal('');
  errorMessage = signal('');
  hidePassword = signal(true);
  hideConfirmPassword = signal(true);

  async onSignUp(): Promise<void> {
    this.errorMessage.set('');

    if (!this.username() || !this.email() || !this.password() || !this.confirmPassword()) {
      this.errorMessage.set('Please fill in all fields');
      return;
    }

    if (this.password() !== this.confirmPassword()) {
      this.errorMessage.set('Passwords do not match');
      return;
    }

    if (this.password().length < 6) {
      this.errorMessage.set('Password must be at least 6 characters long');
      return;
    }

    const success = await this.authService.signup(this.username(), this.email(), this.password());

    if (success) {
      this.router.navigate(['/dashboard']);
    } else {
      this.errorMessage.set('Failed to create account. Email may already be in use.');
    }
  }

  togglePasswordVisibility(): void {
    this.hidePassword.set(!this.hidePassword());
  }

  toggleConfirmPasswordVisibility(): void {
    this.hideConfirmPassword.set(!this.hideConfirmPassword());
  }
}
