using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using LiveSync.Api.Models;

namespace LiveSync.Api.Data
{
    public class ApplicationDbContext : IdentityDbContext<ApplicationUser>
    {
        public ApplicationDbContext(DbContextOptions<ApplicationDbContext> options)
            : base(options)
        {
        }

        public DbSet<Document> Documents { get; set; }
        public DbSet<SharedDocument> SharedDocuments { get; set; }

        protected override void OnModelCreating(ModelBuilder builder)
        {
            base.OnModelCreating(builder);

            // Additional configuration if needed
            builder.Entity<ApplicationUser>(entity =>
            {
                entity.Property(e => e.FirstName).HasMaxLength(50);
                entity.Property(e => e.LastName).HasMaxLength(50);
            });

            // Document configuration
            builder.Entity<Document>(entity =>
            {
                entity.HasKey(e => e.Id);
                entity.Property(e => e.Title).IsRequired().HasMaxLength(200);
                entity.Property(e => e.Content).IsRequired();
                entity.Property(e => e.OwnerId).IsRequired();
                entity.Property(e => e.ShareCode).HasMaxLength(50);
                entity.HasOne(e => e.Owner)
                    .WithMany()
                    .HasForeignKey(e => e.OwnerId)
                    .OnDelete(DeleteBehavior.Cascade);
                entity.HasMany(e => e.SharedWith)
                    .WithOne(s => s.Document)
                    .HasForeignKey(s => s.DocumentId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            // SharedDocument configuration
            builder.Entity<SharedDocument>(entity =>
            {
                entity.HasKey(e => e.Id);
                entity.Property(e => e.DocumentId).IsRequired();
                entity.Property(e => e.UserId).IsRequired();
                entity.HasOne(e => e.Document)
                    .WithMany(d => d.SharedWith)
                    .HasForeignKey(e => e.DocumentId)
                    .OnDelete(DeleteBehavior.Cascade);
                entity.HasOne(e => e.User)
                    .WithMany()
                    .HasForeignKey(e => e.UserId)
                    .OnDelete(DeleteBehavior.Restrict); // Changed to Restrict to avoid multiple cascade paths
            });
        }
    }
}
