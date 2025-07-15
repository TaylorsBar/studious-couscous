# 🏁 Karapiro Cartel - Deployment Guide

**New Zealand's Premier Automotive Ecosystem**

This guide provides comprehensive instructions for deploying the Karapiro Cartel platform - a complete automotive management system with blockchain provenance, CRM integration, and financial automation.

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Start](#quick-start)
3. [Environment Configuration](#environment-configuration)
4. [Blockchain Setup](#blockchain-setup)
5. [CRM Integration](#crm-integration)
6. [Financial Integration](#financial-integration)
7. [Production Deployment](#production-deployment)
8. [Monitoring & Maintenance](#monitoring--maintenance)
9. [Troubleshooting](#troubleshooting)

## 🔧 Prerequisites

### System Requirements
- **Operating System**: Linux (Ubuntu 20.04+), macOS, or Windows with WSL2
- **CPU**: 4+ cores recommended
- **RAM**: 8GB minimum, 16GB recommended
- **Storage**: 50GB+ available space
- **Network**: Stable internet connection for blockchain operations

### Required Software
- **Docker**: Version 20.10+ with Docker Compose
- **Node.js**: Version 18.0+ (for local development)
- **Git**: Latest version
- **PostgreSQL**: Version 15+ (if not using Docker)
- **Redis**: Version 7+ (if not using Docker)

### External Service Accounts
- **Hedera Testnet Account**: For blockchain operations
- **Salesforce Developer Account**: For CRM integration
- **Xero Developer Account**: For financial integration
- **Stripe Account**: For payment processing

## 🚀 Quick Start

### 1. Clone the Repository
```bash
git clone https://github.com/KarapiroCartel/karapiro-cartel.git
cd karapiro-cartel
```

### 2. Environment Setup
```bash
# Copy environment templates
cp server/.env.example server/.env
cp client/.env.example client/.env

# Edit configuration files
nano server/.env
nano client/.env
```

### 3. Start Development Environment
```bash
# Start core services
docker-compose up -d postgres redis kafka

# Install dependencies
npm run install:all

# Set up database
npm run db:setup

# Start development servers
npm run dev
```

### 4. Access the Application
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:3001
- **API Documentation**: http://localhost:3001/docs
- **Kafka UI**: http://localhost:8080

## ⚙️ Environment Configuration

### Server Configuration (`server/.env`)

#### Core Settings
```env
NODE_ENV=development
PORT=3001
DATABASE_URL=postgresql://username:password@localhost:5432/karapiro_cartel
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-super-secret-jwt-key
CORS_ORIGIN=http://localhost:3000
```

#### Hedera Blockchain
```env
HEDERA_NETWORK=testnet
HEDERA_OPERATOR_ID=0.0.123456
HEDERA_OPERATOR_KEY=302e020100300506032b657004220420...
HEDERA_MIRROR_NODE_URL=https://testnet.mirrornode.hedera.com
```

#### Salesforce CRM
```env
SALESFORCE_LOGIN_URL=https://login.salesforce.com
SALESFORCE_USERNAME=your-username@company.com
SALESFORCE_PASSWORD=your-password
SALESFORCE_SECURITY_TOKEN=your-security-token
SALESFORCE_CLIENT_ID=your-client-id
SALESFORCE_CLIENT_SECRET=your-client-secret
```

#### Xero Financial
```env
XERO_CLIENT_ID=your-xero-client-id
XERO_CLIENT_SECRET=your-xero-client-secret
XERO_REDIRECT_URI=http://localhost:3001/auth/xero/callback
XERO_TENANT_ID=your-tenant-id
```

#### Stripe Payments
```env
STRIPE_SECRET_KEY=sk_test_your-stripe-secret-key
STRIPE_PUBLISHABLE_KEY=pk_test_your-stripe-publishable-key
STRIPE_WEBHOOK_SECRET=whsec_your-webhook-secret
```

### Client Configuration (`client/.env`)
```env
REACT_APP_API_URL=http://localhost:3001
REACT_APP_WS_URL=ws://localhost:3001
REACT_APP_HEDERA_NETWORK=testnet
REACT_APP_STRIPE_PUBLISHABLE_KEY=pk_test_your-stripe-publishable-key
```

## 🔗 Blockchain Setup

### 1. Create Hedera Testnet Account
1. Visit [Hedera Portal](https://portal.hedera.com/)
2. Create a testnet account
3. Fund with test HBAR from the faucet
4. Note your Account ID and Private Key

### 2. Initialize Hedera Topics
```bash
# Set up blockchain services
npm run blockchain:setup

# Deploy smart contracts (if applicable)
npm run blockchain:deploy
```

### 3. Configure Kafka for Events
```bash
# Start Kafka services
docker-compose up -d zookeeper kafka

# Create topics
docker exec karapiro-cartel-kafka kafka-topics --create --topic hedera-events --bootstrap-server localhost:9092
docker exec karapiro-cartel-kafka kafka-topics --create --topic part-updates --bootstrap-server localhost:9092
docker exec karapiro-cartel-kafka kafka-topics --create --topic order-updates --bootstrap-server localhost:9092
```

## 🏢 CRM Integration

### Salesforce Setup

#### 1. Create Connected App
1. Go to Setup → Apps → App Manager
2. Create New Connected App
3. Enable OAuth Settings
4. Add callback URL: `http://localhost:3001/auth/salesforce/callback`
5. Select OAuth Scopes: `api`, `refresh_token`, `offline_access`

#### 2. Custom Fields
Create custom fields in Salesforce:

**Account Object:**
- `Business_Type__c` (Picklist)
- `Credit_Limit__c` (Currency)
- `Payment_Terms__c` (Text)
- `Vehicle_Count__c` (Number)
- `Total_Order_Value__c` (Currency)

**Opportunity Object:**
- `Vehicle_Year__c` (Number)
- `Vehicle_Make__c` (Text)
- `Vehicle_Model__c` (Text)
- `Project_Type__c` (Picklist)
- `Parts_Required__c` (Long Text)

#### 3. Test Connection
```bash
# Test Salesforce connection
npm run crm:sync
```

### HubSpot Setup (Alternative)

#### 1. Create Private App
1. Go to Settings → Integrations → Private Apps
2. Create new private app
3. Grant necessary scopes
4. Generate access token

#### 2. Configure Webhooks
Set up webhooks for real-time sync:
- Contact updates
- Deal updates
- Company updates

## 💰 Financial Integration

### Xero Setup

#### 1. Create Xero App
1. Visit [Xero Developer Portal](https://developer.xero.com/)
2. Create new app
3. Configure OAuth 2.0 settings
4. Add redirect URI: `http://localhost:3001/auth/xero/callback`

#### 2. Authorization Flow
```bash
# Start authorization flow
curl http://localhost:3001/auth/xero/authorize

# Complete callback handling
# Check logs for authorization status
```

#### 3. Chart of Accounts Setup
Ensure these accounts exist in Xero:
- `200` - Sales Revenue
- `400` - Cost of Goods Sold
- `090` - Bank Account
- `610` - Accounts Receivable

### MYOB Setup (Alternative)

#### 1. Register Application
1. Visit [MYOB Developer Portal](https://developer.myob.com/)
2. Register new application
3. Configure OAuth settings

#### 2. Company File Access
1. Obtain company file ID
2. Set up user permissions
3. Test API access

## 🚀 Production Deployment

### Docker Production Setup

#### 1. Production Environment
```bash
# Create production environment file
cp server/.env.example server/.env.production

# Configure production settings
nano server/.env.production
```

#### 2. SSL Certificates
```bash
# Create SSL directory
mkdir -p nginx/ssl

# Generate certificates (use Let's Encrypt in production)
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout nginx/ssl/karapiro-cartel.key \
  -out nginx/ssl/karapiro-cartel.crt
```

#### 3. Deploy with Docker Compose
```bash
# Build and deploy
docker-compose --profile production up -d

# Check service status
docker-compose ps

# View logs
docker-compose logs -f
```

### Kubernetes Deployment

#### 1. Prepare Kubernetes Manifests
```bash
# Create namespace
kubectl create namespace karapiro-cartel

# Apply secrets
kubectl apply -f k8s/secrets.yaml

# Deploy services
kubectl apply -f k8s/
```

#### 2. Configure Ingress
```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: karapiro-cartel-ingress
  namespace: karapiro-cartel
spec:
  tls:
  - hosts:
    - karapirocartel.co.nz
    secretName: karapiro-cartel-tls
  rules:
  - host: karapirocartel.co.nz
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: karapiro-cartel-client
            port:
              number: 3000
      - path: /api
        pathType: Prefix
        backend:
          service:
            name: karapiro-cartel-server
            port:
              number: 3001
```

### Cloud Provider Deployment

#### AWS ECS
```bash
# Build and push images
docker build -t karapiro-cartel-server ./server
docker build -t karapiro-cartel-client ./client

# Tag and push to ECR
aws ecr get-login-password --region us-west-2 | docker login --username AWS --password-stdin <account>.dkr.ecr.us-west-2.amazonaws.com

docker tag karapiro-cartel-server:latest <account>.dkr.ecr.us-west-2.amazonaws.com/karapiro-cartel-server:latest
docker push <account>.dkr.ecr.us-west-2.amazonaws.com/karapiro-cartel-server:latest

# Deploy ECS service
aws ecs update-service --cluster karapiro-cartel --service karapiro-cartel-server --force-new-deployment
```

#### Google Cloud Run
```bash
# Build and deploy
gcloud builds submit --tag gcr.io/PROJECT-ID/karapiro-cartel-server ./server
gcloud run deploy karapiro-cartel-server --image gcr.io/PROJECT-ID/karapiro-cartel-server --platform managed
```

## 📊 Monitoring & Maintenance

### Monitoring Setup

#### 1. Prometheus Configuration
```yaml
# monitoring/prometheus.yml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'karapiro-cartel-server'
    static_configs:
      - targets: ['server:3001']
    metrics_path: /metrics
    scrape_interval: 5s

  - job_name: 'postgres'
    static_configs:
      - targets: ['postgres:5432']

  - job_name: 'redis'
    static_configs:
      - targets: ['redis:6379']
```

#### 2. Grafana Dashboards
```bash
# Start monitoring stack
docker-compose up -d prometheus grafana

# Access Grafana
open http://localhost:3003
# Login: admin / admin (change password)
```

#### 3. Alerting Rules
```yaml
# alerts/rules.yml
groups:
  - name: karapiro-cartel
    rules:
      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: High error rate detected

      - alert: DatabaseDown
        expr: up{job="postgres"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: Database is down
```

### Backup Strategy

#### 1. Database Backups
```bash
# Manual backup
docker exec karapiro-cartel-postgres pg_dump -U karapiro_user karapiro_cartel > backup_$(date +%Y%m%d_%H%M%S).sql

# Automated backups (using cron)
0 2 * * * docker exec karapiro-cartel-postgres pg_dump -U karapiro_user karapiro_cartel | gzip > /backups/karapiro_cartel_$(date +\%Y\%m\%d).sql.gz
```

#### 2. File Storage Backups
```bash
# Backup uploads directory
tar -czf uploads_backup_$(date +%Y%m%d).tar.gz server/uploads/

# Sync to cloud storage
aws s3 sync server/uploads/ s3://karapiro-cartel-backups/uploads/
```

#### 3. Configuration Backups
```bash
# Backup environment files
tar -czf config_backup_$(date +%Y%m%d).tar.gz server/.env client/.env docker-compose.yml
```

### Health Checks

#### 1. Application Health
```bash
# Check API health
curl http://localhost:3001/health

# Check database connection
curl http://localhost:3001/health/database

# Check Redis connection
curl http://localhost:3001/health/redis

# Check blockchain connection
curl http://localhost:3001/health/blockchain
```

#### 2. Service Status
```bash
# Check all services
docker-compose ps

# Check specific service logs
docker-compose logs -f server

# Check resource usage
docker stats
```

## 🔧 Troubleshooting

### Common Issues

#### 1. Database Connection Issues
```bash
# Check PostgreSQL status
docker-compose logs postgres

# Reset database
docker-compose down
docker volume rm karapiro-cartel_postgres_data
docker-compose up -d postgres
npm run db:setup
```

#### 2. Blockchain Connection Issues
```bash
# Check Hedera network status
curl https://testnet.mirrornode.hedera.com/api/v1/network/nodes

# Verify account balance
npm run blockchain:balance

# Re-initialize topics
npm run blockchain:setup
```

#### 3. CRM Sync Issues
```bash
# Test Salesforce connection
npm run crm:test

# Check sync logs
docker-compose logs server | grep CRM

# Manual sync
npm run crm:sync
```

#### 4. Performance Issues
```bash
# Check resource usage
docker stats

# Analyze slow queries
docker exec karapiro-cartel-postgres psql -U karapiro_user -d karapiro_cartel -c "SELECT query, mean_time FROM pg_stat_statements ORDER BY mean_time DESC LIMIT 10;"

# Clear Redis cache
docker exec karapiro-cartel-redis redis-cli FLUSHALL
```

### Log Analysis

#### 1. Application Logs
```bash
# Server logs
docker-compose logs -f server

# Client logs
docker-compose logs -f client

# Database logs
docker-compose logs -f postgres
```

#### 2. Centralized Logging
```bash
# Using ELK Stack
docker-compose -f docker-compose.yml -f docker-compose.elk.yml up -d

# Access Kibana
open http://localhost:5601
```

### Performance Optimization

#### 1. Database Optimization
```sql
-- Create indexes for frequently queried columns
CREATE INDEX CONCURRENTLY idx_parts_sku ON parts(sku);
CREATE INDEX CONCURRENTLY idx_orders_customer_id ON orders(customer_id);
CREATE INDEX CONCURRENTLY idx_orders_created_at ON orders(created_at);

-- Analyze query performance
EXPLAIN ANALYZE SELECT * FROM orders WHERE customer_id = 'user-id';
```

#### 2. Redis Optimization
```bash
# Configure Redis memory policy
docker exec karapiro-cartel-redis redis-cli CONFIG SET maxmemory-policy allkeys-lru

# Monitor Redis performance
docker exec karapiro-cartel-redis redis-cli INFO memory
```

#### 3. Application Optimization
```bash
# Enable production optimizations
NODE_ENV=production npm run build

# Use PM2 for process management
npm install -g pm2
pm2 start ecosystem.config.js
```

## 📞 Support

For additional support and questions:

- **Documentation**: https://docs.karapirocartel.co.nz
- **Community Forum**: https://forum.karapirocartel.co.nz
- **Email Support**: support@karapirocartel.co.nz
- **Emergency Support**: +64 9 XXX XXXX

## 🔄 Updates

### Updating the Platform
```bash
# Pull latest changes
git pull origin main

# Update dependencies
npm run install:all

# Run database migrations
npm run db:migrate

# Restart services
docker-compose restart
```

### Version Management
```bash
# Check current version
npm run version

# Update to specific version
git checkout v1.2.0
npm run install:all
npm run db:migrate
```

---

**Rev up your automotive business with Karapiro Cartel! 🏁**

*"From the workshop to the track, we've got you covered."*