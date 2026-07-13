# Stage 1: Build
FROM maven:3.9-eclipse-temurin-17 AS builder
WORKDIR /build
COPY pom.xml settings.xml ./
COPY src ./src
RUN mvn -B -s settings.xml -DskipTests package

# Stage 2: Runtime
FROM eclipse-temurin:17
WORKDIR /app
COPY --from=builder /build/target/user-auditor-1.0.0.jar ./

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "user-auditor-1.0.0.jar"]
