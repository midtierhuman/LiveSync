# Build Stage
FROM eclipse-temurin:21-jdk-alpine AS build

WORKDIR /app

# Copy gradle wrapper and config files
COPY gradle gradle
COPY gradlew build.gradle settings.gradle ./

# Grant execution permissions for gradlew
RUN chmod +x gradlew

# Download dependencies (caching layer)
RUN ./gradlew dependencies --no-daemon || true

# Copy source code and build bootable JAR
COPY src src
RUN ./gradlew bootJar -x test --no-daemon

# Final Runtime Stage
FROM eclipse-temurin:21-jre-alpine AS production

WORKDIR /app

# Create non-root user
RUN addgroup -S livesync && adduser -S livesync -G livesync

# Copy compiled JAR from build stage
COPY --from=build /app/build/libs/*.jar app.jar

USER livesync

EXPOSE 8080

ENV SPRING_PROFILES_ACTIVE=development

ENTRYPOINT ["java", "-jar", "app.jar"]
