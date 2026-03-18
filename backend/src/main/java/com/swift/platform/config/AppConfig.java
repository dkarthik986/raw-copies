package com.swift.platform.config;

import lombok.Getter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;

/**
 * Central configuration bean.
 * All @Value fields live here — override any with OS env vars, no rebuild needed.
 *
 *   export MONGO_COLLECTION_SWIFT=my_swift_msgs
 *   export JWT_SECRET=my-secret-key
 *   java -jar swift-backend.jar
 */
@Getter
@Configuration
public class AppConfig {

    // ── MongoDB collections ────────────────────────────────────────────────
    @Value("${mongo.collection.swift:jason_swift}")
    private String swiftCollection;

    @Value("${mongo.collection.users:user_data}")
    private String usersCollection;

    @Value("${mongo.collection.audit:audit_logs}")
    private String auditCollection;

    // ── Search ────────────────────────────────────────────────────────────
    @Value("${search.default-page-size:20}")
    private int defaultPageSize;

    @Value("${search.max-page-size:500}")
    private int maxPageSize;

    @Value("${mongo.collection.rawcopies:amp_raw_copies}")
    private String rawCopiesCollection;

    // ── Admin ─────────────────────────────────────────────────────────────
    @Value("${admin.protected-id:ADMIN001}")
    private String protectedAdminId;

    // ── JWT ───────────────────────────────────────────────────────────────
    @Value("${jwt.secret:SwiftPlatformSecretKey2024!@#$%^&*()ABCDEF_MUST_BE_32_CHARS_MIN}")
    private String jwtSecret;

    @Value("${jwt.expiration:86400000}")
    private long jwtExpiration;
}