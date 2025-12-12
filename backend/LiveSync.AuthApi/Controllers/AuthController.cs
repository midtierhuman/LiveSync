using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using LiveSync.AuthApi.DTOs;
using LiveSync.AuthApi.Services;

namespace LiveSync.AuthApi.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class AuthController : ControllerBase
    {
        private readonly IAuthService _authService;
        private readonly ILogger<AuthController> _logger;

        public AuthController(IAuthService authService, ILogger<AuthController> logger)
        {
            _authService = authService;
            _logger = logger;
        }

        /// <summary>
        /// Register a new user with email and password
        /// </summary>
        [HttpPost("register")]
        [ProducesResponseType(typeof(AuthResponse), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        public async Task<ActionResult<AuthResponse>> Register([FromBody] RegisterRequest request)
        {
            if (!ModelState.IsValid)
            {
                return BadRequest(ModelState);
            }

            var response = await _authService.RegisterAsync(request);

            if (!response.Success)
            {
                return BadRequest(response);
            }

            return Ok(response);
        }

        /// <summary>
        /// Login with email/username and password
        /// </summary>
        [HttpPost("login")]
        [ProducesResponseType(typeof(AuthResponse), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status401Unauthorized)]
        public async Task<ActionResult<AuthResponse>> Login([FromBody] LoginRequest request)
        {
            if (!ModelState.IsValid)
            {
                return BadRequest(ModelState);
            }

            var response = await _authService.LoginAsync(request);

            if (!response.Success)
            {
                return Unauthorized(response);
            }

            return Ok(response);
        }

        /// <summary>
        /// Refresh JWT token
        /// </summary>
        [HttpPost("refresh")]
        [ProducesResponseType(typeof(AuthResponse), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status401Unauthorized)]
        public async Task<ActionResult<AuthResponse>> RefreshToken([FromBody] string token)
        {
            if (string.IsNullOrEmpty(token))
            {
                return BadRequest(new AuthResponse 
                { 
                    Success = false, 
                    Message = "Token is required." 
                });
            }

            var response = await _authService.RefreshTokenAsync(token);

            if (!response.Success)
            {
                return Unauthorized(response);
            }

            return Ok(response);
        }

        /// <summary>
        /// Get current user information (requires authentication)
        /// </summary>
        [Authorize]
        [HttpGet("me")]
        [ProducesResponseType(typeof(UserInfo), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status401Unauthorized)]
        public ActionResult<UserInfo> GetCurrentUser()
        {
            var userId = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
            var email = User.FindFirst(System.Security.Claims.ClaimTypes.Email)?.Value;
            var userName = User.FindFirst(System.Security.Claims.ClaimTypes.Name)?.Value;

            if (string.IsNullOrEmpty(userId))
            {
                return Unauthorized();
            }

            return Ok(new UserInfo
            {
                Id = userId,
                Email = email ?? string.Empty,
                UserName = userName
            });
        }

        #region OAuth Endpoints - Placeholder for Future Implementation

        /// <summary>
        /// Login with Google OAuth (Not yet implemented)
        /// </summary>
        [HttpPost("oauth/google")]
        [ProducesResponseType(typeof(AuthResponse), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status501NotImplemented)]
        public async Task<ActionResult<AuthResponse>> GoogleLogin([FromBody] OAuthLoginRequest request)
        {
            var response = await _authService.GoogleLoginAsync(request);
            
            if (!response.Success)
            {
                return StatusCode(StatusCodes.Status501NotImplemented, response);
            }

            return Ok(response);
        }

        /// <summary>
        /// Login with GitHub OAuth (Not yet implemented)
        /// </summary>
        [HttpPost("oauth/github")]
        [ProducesResponseType(typeof(AuthResponse), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status501NotImplemented)]
        public async Task<ActionResult<AuthResponse>> GitHubLogin([FromBody] OAuthLoginRequest request)
        {
            var response = await _authService.GitHubLoginAsync(request);
            
            if (!response.Success)
            {
                return StatusCode(StatusCodes.Status501NotImplemented, response);
            }

            return Ok(response);
        }

        /// <summary>
        /// Login with Microsoft OAuth (Not yet implemented)
        /// </summary>
        [HttpPost("oauth/microsoft")]
        [ProducesResponseType(typeof(AuthResponse), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status501NotImplemented)]
        public async Task<ActionResult<AuthResponse>> MicrosoftLogin([FromBody] OAuthLoginRequest request)
        {
            var response = await _authService.MicrosoftLoginAsync(request);
            
            if (!response.Success)
            {
                return StatusCode(StatusCodes.Status501NotImplemented, response);
            }

            return Ok(response);
        }

        #endregion
    }
}
