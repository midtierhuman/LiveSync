using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LiveSync.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddDefaultAccessLevelToDocument : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "DefaultAccessLevel",
                table: "Documents",
                type: "nvarchar(50)",
                maxLength: 50,
                nullable: false,
                defaultValue: "View");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "DefaultAccessLevel",
                table: "Documents");
        }
    }
}
