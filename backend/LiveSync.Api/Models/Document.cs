using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace LiveSync.Api.Models
{
    public class Document
    {
        [Key]
        public string Id { get; set; } = Guid.NewGuid().ToString();

        [Required]
        [StringLength(200)]
        public string Title { get; set; } = string.Empty;

        [Required]
        public string Content { get; set; } = string.Empty;

        [Required]
        public string OwnerId { get; set; } = string.Empty;

        [ForeignKey(nameof(OwnerId))]
        public ApplicationUser? Owner { get; set; }

        public string? ShareCode { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

        public DateTime? LastEditedAt { get; set; }

        public string? LastEditedBy { get; set; }

        // Navigation property for shared access
        public ICollection<SharedDocument> SharedWith { get; set; } = new List<SharedDocument>();
    }

    public class SharedDocument
    {
        [Key]
        public string Id { get; set; } = Guid.NewGuid().ToString();

        [Required]
        public string DocumentId { get; set; } = string.Empty;

        [ForeignKey(nameof(DocumentId))]
        public Document? Document { get; set; }

        [Required]
        public string UserId { get; set; } = string.Empty;

        [ForeignKey(nameof(UserId))]
        public ApplicationUser? User { get; set; }

        public DateTime SharedAt { get; set; } = DateTime.UtcNow;

        [StringLength(50)]
        public string? AccessLevel { get; set; } = "View"; // View or Edit
    }
}
