using Microsoft.AspNetCore.Identity;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using LiveSync.AuthApi.DTOs;
using LiveSync.AuthApi.Models;

namespace LiveSync.AuthApi.Services
{
    public class AuthService : IAuthService
    {
        private readonly UserManager<ApplicationUser> _userManager;
        private readonly SignInManager<ApplicationUser> _signInManager;
        private readonly IConfiguration _configuration;
        private readonly ILogger<AuthService> _logger;

        public AuthService(
            UserManager<ApplicationUser> userManager,
            SignInManager<ApplicationUser> signInManager,
            IConfiguration configuration,
            ILogger<AuthService> logger)
        {
            _userManager = userManager;
            _signInManager = signInManager;
            _configuration = configuration;
            _logger = logger;
        }

        public async Task<AuthResponse> RegisterAsync(RegisterRequest request)
        {
            try
            {
                // Check if user already exists
                var existingUser = await _userManager.FindByEmailAsync(request.Email);
                if (existingUser != null)
                {
                    return new AuthResponse
                    {
                        Success = false,
                        Message = "User with this email already exists."
                    };
                }

                // Create new user
                var user = new ApplicationUser
                {
                    UserName = request.Email,
                    Email = request.Email,
                    FirstName = request.FirstName,
                    LastName = request.LastName,
                    CreatedAt = DateTime.UtcNow
                };

                var result = await _userManager.CreateAsync(user, request.Password);

                if (!result.Succeeded)
                {
                    var errors = string.Join(", ", result.Errors.Select(e => e.Description));
                    return new AuthResponse
                    {
                        Success = false,
                        Message = $"Registration failed: {errors}"
                    };
                }

                // Generate JWT token
                var token = await GenerateJwtToken(user);

                return new AuthResponse
                {
                    Success = true,
                    Message = "Registration successful.",
                    Token = token,
                    Expiration = DateTime.UtcNow.AddHours(GetTokenExpirationHours()),
                    User = new UserInfo
                    {
                        Id = user.Id,
                        Email = user.Email!,
                        UserName = user.UserName,
                        FirstName = user.FirstName,
                        LastName = user.LastName
                    }
                };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error during registration");
                return new AuthResponse
                {
                    Success = false,
                    Message = "An error occurred during registration."
                };
            }
        }

        public async Task<AuthResponse> LoginAsync(LoginRequest request)
        {
            try
            {
                // Find user by email or username
                var user = await _userManager.FindByEmailAsync(request.EmailOrUsername)
                    ?? await _userManager.FindByNameAsync(request.EmailOrUsername);

                if (user == null)
                {
                    return new AuthResponse
                    {
                        Success = false,
                        Message = "Invalid credentials."
                    };
                }

                // Check password
                var result = await _signInManager.CheckPasswordSignInAsync(user, request.Password, lockoutOnFailure: true);

                if (!result.Succeeded)
                {
                    if (result.IsLockedOut)
                    {
                        return new AuthResponse
                        {
                            Success = false,
                            Message = "Account is locked out. Please try again later."
                        };
                    }

                    return new AuthResponse
                    {
                        Success = false,
                        Message = "Invalid credentials."
                    };
                }

                // Update last login time
                user.LastLoginAt = DateTime.UtcNow;
                await _userManager.UpdateAsync(user);

                // Generate JWT token
                var token = await GenerateJwtToken(user);

                return new AuthResponse
                {
                    Success = true,
                    Message = "Login successful.",
                    Token = token,
                    Expiration = DateTime.UtcNow.AddHours(GetTokenExpirationHours()),
                    User = new UserInfo
                    {
                        Id = user.Id,
                        Email = user.Email!,
                        UserName = user.UserName,
                        FirstName = user.FirstName,
                        LastName = user.LastName
                    }
                };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error during login");
                return new AuthResponse
                {
                    Success = false,
                    Message = "An error occurred during login."
                };
            }
        }

        public async Task<AuthResponse> RefreshTokenAsync(string token)
        {
            // TODO: Implement refresh token logic
            // This would require storing refresh tokens in the database
            await Task.CompletedTask;
            
            return new AuthResponse
            {
                Success = false,
                Message = "Refresh token functionality not yet implemented."
            };
        }

        #region OAuth Methods - Placeholder for Future Implementation

        public async Task<AuthResponse> GoogleLoginAsync(OAuthLoginRequest request)
        {
            // TODO: Implement Google OAuth login
            // 1. Validate the access token with Google
            // 2. Get user info from Google
            // 3. Find or create user in database
            // 4. Generate JWT token
            
            await Task.CompletedTask;
            
            return new AuthResponse
            {
                Success = false,
                Message = "Google OAuth login not yet implemented."
            };
        }

        public async Task<AuthResponse> GitHubLoginAsync(OAuthLoginRequest request)
        {
            // TODO: Implement GitHub OAuth login
            // 1. Validate the access token with GitHub
            // 2. Get user info from GitHub
            // 3. Find or create user in database
            // 4. Generate JWT token
            
            await Task.CompletedTask;
            
            return new AuthResponse
            {
                Success = false,
                Message = "GitHub OAuth login not yet implemented."
            };
        }

        public async Task<AuthResponse> MicrosoftLoginAsync(OAuthLoginRequest request)
        {
            // TODO: Implement Microsoft OAuth login
            // 1. Validate the access token with Microsoft
            // 2. Get user info from Microsoft
            // 3. Find or create user in database
            // 4. Generate JWT token
            
            await Task.CompletedTask;
            
            return new AuthResponse
            {
                Success = false,
                Message = "Microsoft OAuth login not yet implemented."
            };
        }

        #endregion

        #region Private Helper Methods

        private async Task<string> GenerateJwtToken(ApplicationUser user)
        {
            var userRoles = await _userManager.GetRolesAsync(user);

            var claims = new List<Claim>
            {
                new Claim(ClaimTypes.NameIdentifier, user.Id),
                new Claim(ClaimTypes.Name, user.UserName ?? string.Empty),
                new Claim(ClaimTypes.Email, user.Email ?? string.Empty),
                new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString())
            };

            // Add role claims
            foreach (var role in userRoles)
            {
                claims.Add(new Claim(ClaimTypes.Role, role));
            }

            var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(
                _configuration["Jwt:Secret"] ?? throw new InvalidOperationException("JWT Secret not configured")));
            var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

            var token = new JwtSecurityToken(
                issuer: _configuration["Jwt:Issuer"],
                audience: _configuration["Jwt:Audience"],
                claims: claims,
                expires: DateTime.UtcNow.AddHours(GetTokenExpirationHours()),
                signingCredentials: creds
            );

            return new JwtSecurityTokenHandler().WriteToken(token);
        }

        private int GetTokenExpirationHours()
        {
            return _configuration.GetValue<int>("Jwt:ExpirationHours", 24);
        }

        #endregion
    }
}
