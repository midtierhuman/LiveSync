var builder = DistributedApplication.CreateBuilder(args);

// PostgreSQL — used by LiveSync.Api. Database name and resource name match the
// app's existing "ConnectionStrings:DefaultConnection" key so no code changes
// are required in LiveSync.Api.
var postgres = builder.AddPostgres("postgres")
    .WithDataVolume();

var postgresDb = postgres.AddDatabase("DefaultConnection", "livesync");

// Redis — used by LiveSync.SignalR for backplane + document state.
var redis = builder.AddRedis("redis")
    .WithDataVolume();

// Sandbox execution service — used by LiveSync.Api for isolated code execution.
var sandbox = builder.AddProject<Projects.LiveSync_Sandbox>("sandbox");

var api = builder.AddProject<Projects.LiveSync_Api>("api")
    .WithReference(postgresDb)
    .WaitFor(postgresDb)
    .WithEnvironment("Services__SandboxBaseUrl", sandbox.GetEndpoint("http"))
    .WithReference(sandbox)
    .WaitFor(sandbox)
    .WithExternalHttpEndpoints();

// SignalR depends on both Redis and the Api service. Existing config keys
// ("Redis:ConnectionString", "Services:ApiBaseUrl") are matched via explicit
// WithEnvironment calls so LiveSync.SignalR requires no code changes.
builder.AddProject<Projects.LiveSync_SignalR>("signalr")
    .WithEnvironment("Redis__ConnectionString", redis.Resource.ConnectionStringExpression)
    .WithReference(redis)
    .WaitFor(redis)
    .WithEnvironment("Services__ApiBaseUrl", api.GetEndpoint("https"))
    .WaitFor(api)
    .WithExternalHttpEndpoints();

builder.Build().Run();
