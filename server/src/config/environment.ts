import dotenv from 'dotenv'
import { z } from 'zod'

// Load environment variables
dotenv.config()

// Environment schema for validation
const envSchema = z.object({
  // Node
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).default(3001),

  // Database
  DATABASE_URL: z.string().url(),

  // Redis
  REDIS_URL: z.string().url(),
  REDIS_PASSWORD: z.string().optional(),

  // JWT
  JWT_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('1h'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  // Session
  SESSION_SECRET: z.string().min(32),

  // CORS
  CORS_ORIGIN: z.string().url(),

  // Email
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().transform(Number).optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  EMAIL_FROM: z.string().email().optional(),

  // File Upload
  MAX_FILE_SIZE: z.string().transform(Number).default(10485760),
  UPLOAD_PATH: z.string().default('./uploads'),

  // API Keys
  API_KEY_SECRET: z.string().min(32),

  // Logging
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  LOG_FILE: z.string().default('./logs/app.log'),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.string().transform(Number).default(900000),
  RATE_LIMIT_MAX_REQUESTS: z.string().transform(Number).default(100),

  // Webhook
  WEBHOOK_SECRET: z.string().min(32),

  // External APIs
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  // Monitoring
  SENTRY_DSN: z.string().optional(),
  DATADOG_API_KEY: z.string().optional(),

  // Analytics
  GOOGLE_ANALYTICS_ID: z.string().optional(),

  // Feature Flags
  ENABLE_REGISTRATION: z.string().transform(Boolean).default(true),
  ENABLE_EMAIL_VERIFICATION: z.string().transform(Boolean).default(true),
  ENABLE_SOCIAL_LOGIN: z.string().transform(Boolean).default(true),
  ENABLE_FILE_UPLOAD: z.string().transform(Boolean).default(true),
  ENABLE_REAL_TIME: z.string().transform(Boolean).default(true),
  ENABLE_ANALYTICS: z.string().transform(Boolean).default(true),
})

// Validate environment variables
const env = envSchema.parse(process.env)

// Export configuration
export const config = {
  node: {
    env: env.NODE_ENV,
    isDevelopment: env.NODE_ENV === 'development',
    isProduction: env.NODE_ENV === 'production',
    isTest: env.NODE_ENV === 'test',
  },
  server: {
    port: env.PORT,
  },
  database: {
    url: env.DATABASE_URL,
  },
  redis: {
    url: env.REDIS_URL,
    password: env.REDIS_PASSWORD,
  },
  jwt: {
    secret: env.JWT_SECRET,
    refreshSecret: env.JWT_REFRESH_SECRET,
    expiresIn: env.JWT_EXPIRES_IN,
    refreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN,
  },
  session: {
    secret: env.SESSION_SECRET,
  },
  cors: {
    origin: env.CORS_ORIGIN,
  },
  email: {
    smtp: {
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      user: env.SMTP_USER,
      password: env.SMTP_PASSWORD,
    },
    from: env.EMAIL_FROM,
  },
  upload: {
    maxFileSize: env.MAX_FILE_SIZE,
    path: env.UPLOAD_PATH,
  },
  apiKey: {
    secret: env.API_KEY_SECRET,
  },
  logging: {
    level: env.LOG_LEVEL,
    file: env.LOG_FILE,
  },
  rateLimit: {
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    maxRequests: env.RATE_LIMIT_MAX_REQUESTS,
  },
  webhook: {
    secret: env.WEBHOOK_SECRET,
  },
  external: {
    github: {
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET,
    },
    google: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    },
  },
  monitoring: {
    sentryDsn: env.SENTRY_DSN,
    datadogApiKey: env.DATADOG_API_KEY,
  },
  analytics: {
    googleAnalyticsId: env.GOOGLE_ANALYTICS_ID,
  },
  features: {
    registration: env.ENABLE_REGISTRATION,
    emailVerification: env.ENABLE_EMAIL_VERIFICATION,
    socialLogin: env.ENABLE_SOCIAL_LOGIN,
    fileUpload: env.ENABLE_FILE_UPLOAD,
    realTime: env.ENABLE_REAL_TIME,
    analytics: env.ENABLE_ANALYTICS,
  },
} as const

export type Config = typeof config