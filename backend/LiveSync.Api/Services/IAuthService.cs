using LiveSync.Api.DTOs;
using LiveSync.Api.Models;

namespace LiveSync.Api.Services
{
    public interface IAuthService
    {
        Task<AuthResponse> RegisterAsync(RegisterRequest request);
        Task<AuthResponse> LoginAsync(LoginRequest request);
        Task<AuthResponse> RefreshTokenAsync(string token);
        
        // Placeholder methods for OAuth - to be implemented later
        Task<AuthResponse> GoogleLoginAsync(OAuthLoginRequest request);
        Task<AuthResponse> GitHubLoginAsync(OAuthLoginRequest request);
        Task<AuthResponse> MicrosoftLoginAsync(OAuthLoginRequest request);
    }
}
