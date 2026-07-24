FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# 1. Copy project files for both the service and its contract dependency
COPY ["LiveSync.Sandbox/LiveSync.Sandbox.csproj", "LiveSync.Sandbox/"]
COPY ["LiveSync.Execution.Contracts/LiveSync.Execution.Contracts.csproj", "LiveSync.Execution.Contracts/"]

# 2. Restore dependencies
RUN dotnet restore "LiveSync.Sandbox/LiveSync.Sandbox.csproj"

# 3. Copy source files for both projects
COPY LiveSync.Sandbox/ LiveSync.Sandbox/
COPY LiveSync.Execution.Contracts/ LiveSync.Execution.Contracts/

# 4. Build and Publish
WORKDIR "/src/LiveSync.Sandbox"
RUN dotnet publish "LiveSync.Sandbox.csproj" -c Release -o /app/publish /p:UseAppHost=false

# Stage 2: .NET 10 SDK Runtime (required for `dotnet run` during code execution)
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS runtime
WORKDIR /app
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080

COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "LiveSync.Sandbox.dll"]