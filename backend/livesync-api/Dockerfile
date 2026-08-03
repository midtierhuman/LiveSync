# Build Stage
FROM gradle:8.14.5-jdk21-alpine AS build

WORKDIR /app

# Copy Gradle build files
COPY build.gradle settings.gradle ./
COPY gradle gradle

# Copy source code and build bootable JAR
COPY src src
RUN gradle bootJar -x test --no-daemon

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
