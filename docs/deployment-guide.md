# SWIFT Platform — Deployment Guide

## Quick Start (Local Development)

### 1. Start Backend

```bash
cd backend
mvn clean package -DskipTests
java -jar target/swift-backend-2.0.0.jar
```

Override any setting without recompiling:
```bash
export MONGO_URI=mongodb://localhost:27017/swiftdb
export JWT_SECRET=your-secret-key-min-32-chars
export CORS_ALLOWED_ORIGINS=http://localhost:3000
java -jar target/swift-backend-2.0.0.jar
```

### 2. Start Frontend (Dev Mode)

```bash
# Terminal 1
cd frontend/mfe-user-management && npm install && npm start   # :3001

# Terminal 2
cd frontend/mfe-search && npm install && npm start            # :3002

# Terminal 3
cd frontend/mfe-profile && npm install && npm start           # :3003

# Terminal 4
cd frontend/shell-app && npm install && npm start             # :3000
```

Open http://localhost:3000

---

## All Soft-Coded Configuration

### Backend — Environment Variables

| Variable | Default | Description |
|---|---|---|
| `SERVER_PORT` | `8080` | HTTP port |
| `MONGO_URI` | `mongodb://localhost:27017/swiftdb` | MongoDB connection string |
| `MONGO_DATABASE` | `swiftdb` | Database name |
| `MONGO_COLLECTION_SWIFT` | `jason_swift` | SWIFT messages collection |
| `MONGO_COLLECTION_USERS` | `user_data` | Users collection |
| `MONGO_COLLECTION_AUDIT` | `audit_logs` | Audit logs collection |
| `JWT_SECRET` | *(default key)* | JWT signing secret (min 32 chars) |
| `JWT_EXPIRATION_MS` | `86400000` | Token lifetime in ms (24h) |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:3000,...` | Comma-separated allowed origins |
| `ADMIN_PROTECTED_ID` | `ADMIN001` | Employee ID that cannot be deleted |
| `SEARCH_DEFAULT_PAGE_SIZE` | `20` | Default search page size |
| `SEARCH_MAX_PAGE_SIZE` | `500` | Max allowed search page size |
| `LOG_LEVEL_APP` | `INFO` | App log level |
| `ACTUATOR_ENDPOINTS` | `health,info,metrics` | Exposed actuator endpoints |

### Frontend — `.env` Variables (per MFE)

| Variable | Description |
|---|---|
| `REACT_APP_API_BASE_URL` | Backend URL (e.g. `https://api.mycompany.com`) |
| `REACT_APP_APP_NAME` | App name shown in login + navbar |
| `REACT_APP_APP_SUBTITLE` | Subtitle shown on login screen |
| `REACT_APP_PRIMARY_COLOR` | Brand primary colour (hex) |
| `REACT_APP_ACCENT_COLOR` | Accent/secondary colour (hex) |
| `REACT_APP_HEADING_COLOR` | Heading text colour |
| `REACT_APP_BACKGROUND_COLOR` | Page background colour |
| `REACT_APP_TEXT_COLOR` | Body text colour |
| `REACT_APP_FONT` | CSS font-family stack |
| `USER_MFE_URL` | URL where mfe-user-management is served |
| `SEARCH_MFE_URL` | URL where mfe-search is served |
| `PROFILE_MFE_URL` | URL where mfe-profile is served |

---

## Production Deployment (JAR + NGINX)

### 1. Build Backend JAR

```bash
cd backend
mvn clean package -DskipTests
# Output: target/swift-backend-2.0.0.jar
```

### 2. Build Frontend

```bash
# Set production API URL before building
export REACT_APP_API_BASE_URL=https://api.mycompany.com

bash infrastructure/build-frontend.sh
```

### 3. Deploy Frontend Dist Folders

```bash
# Copy each MFE dist to your web root
sudo cp -r frontend/shell-app/dist/*           /var/www/swift/shell/
sudo cp -r frontend/mfe-search/dist/*          /var/www/swift/search/
sudo cp -r frontend/mfe-user-management/dist/* /var/www/swift/usermgmt/
sudo cp -r frontend/mfe-profile/dist/*         /var/www/swift/profile/
```

### 4. Configure NGINX

Edit `infrastructure/nginx/swift-platform.conf` — replace all `__PLACEHOLDER__` values:

```bash
sudo cp infrastructure/nginx/swift-platform.conf /etc/nginx/conf.d/
sudo sed -i 's/__DOMAIN__/swift.mycompany.com/g'             /etc/nginx/conf.d/swift-platform.conf
sudo sed -i 's|__SHELL_DIST__|/var/www/swift/shell|g'        /etc/nginx/conf.d/swift-platform.conf
sudo sed -i 's|__SEARCH_DIST__|/var/www/swift/search|g'      /etc/nginx/conf.d/swift-platform.conf
sudo sed -i 's|__USERMGMT_DIST__|/var/www/swift/usermgmt|g'  /etc/nginx/conf.d/swift-platform.conf
sudo sed -i 's|__PROFILE_DIST__|/var/www/swift/profile|g'    /etc/nginx/conf.d/swift-platform.conf
sudo sed -i 's|__API_HOST__|127.0.0.1:8080|g'               /etc/nginx/conf.d/swift-platform.conf
sudo nginx -t && sudo nginx -s reload
```

### 5. Start Backend

```bash
export MONGO_URI=mongodb://prod-mongo:27017/swiftdb
export JWT_SECRET=your-production-secret-key-must-be-32-chars-minimum
export CORS_ALLOWED_ORIGINS=https://swift.mycompany.com
export SERVER_PORT=8080

bash infrastructure/start.sh
```

---

## Re-branding Without Code Changes

Change theme colours by editing `.env` files and rebuilding:

```bash
# Edit frontend/shell-app/.env
REACT_APP_PRIMARY_COLOR=#10b981
REACT_APP_ACCENT_COLOR=#059669
REACT_APP_BACKGROUND_COLOR=#f0fdf4
REACT_APP_HEADING_COLOR=#064e3b
REACT_APP_APP_NAME=FinPay Platform

# Rebuild
bash infrastructure/build-frontend.sh
```

No code changes needed. All CSS variables are driven by `applyTheme()` which reads from `.env`.

---

## Changing MongoDB Collections Without Code Changes

```bash
export MONGO_COLLECTION_SWIFT=production_swift_messages
export MONGO_COLLECTION_USERS=platform_users
java -jar target/swift-backend-2.0.0.jar
```

The `AppConfig` bean is the single source of truth — all services read from it.

---

## Default Login Credentials

Seed users using the original `seed-users.js` script or insert directly into MongoDB:

```javascript
// Example: ADMIN001 / admin123
db.user_data.insertOne({
  employeeId: "ADMIN001",
  password: "admin123",
  role: "ADMIN",
  name: "System Administrator",
  email: "admin@swift.com",
  active: true,
  createdAt: new Date()
})
```

---

## Health Check

```bash
curl http://localhost:8080/actuator/health
# {"status":"UP","components":{"mongo":{"status":"UP"}}}
```
