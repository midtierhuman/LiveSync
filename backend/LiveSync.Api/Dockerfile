# Build stage
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# 1. Copy project files for caching restore layer
COPY ["LiveSync.Api/LiveSync.Api.csproj", "LiveSync.Api/"]
COPY ["LiveSync.Execution.Contracts/LiveSync.Execution.Contracts.csproj", "LiveSync.Execution.Contracts/"]

# 2. Restore ONLY the API project
RUN dotnet restore "LiveSync.Api/LiveSync.Api.csproj"

# 3. Copy source code
COPY LiveSync.Api/ LiveSync.Api/
COPY LiveSync.Execution.Contracts/ LiveSync.Execution.Contracts/

# 4. Publish ONLY LiveSync.Api.csproj
WORKDIR "/src/LiveSync.Api"
RUN dotnet publish "LiveSync.Api.csproj" -c Release -o /app/publish /p:UseAppHost=false

# Runtime stage
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080

COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "LiveSync.Api.dll"]