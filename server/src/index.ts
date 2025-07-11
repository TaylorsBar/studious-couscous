import 'reflect-metadata'
import 'express-async-errors'
import express from 'express'
import http from 'http'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import compression from 'compression'
import cookieParser from 'cookie-parser'
import session from 'express-session'
import rateLimit from 'express-rate-limit'
import { Server as SocketIOServer } from 'socket.io'
import RedisStore from 'connect-redis'
import { createClient } from 'redis'

import { config } from '@/config/environment'
import { logger } from '@/utils/logger'
import { prisma } from '@/config/database'
import { redisClient } from '@/config/redis'
import { errorHandler } from '@/middleware/errorHandler'
import { notFoundHandler } from '@/middleware/notFoundHandler'
import { requestLogger } from '@/middleware/requestLogger'
import { validateApiKey } from '@/middleware/validateApiKey'
import { setupSwagger } from '@/config/swagger'
import { setupWebSocket } from '@/websocket/socketHandler'
import { setupCronJobs } from '@/services/cronService'
import { setupBullDashboard } from '@/config/bull'

// Import routes
import authRoutes from '@/routes/authRoutes'
import userRoutes from '@/routes/userRoutes'
import projectRoutes from '@/routes/projectRoutes'
import taskRoutes from '@/routes/taskRoutes'
import teamRoutes from '@/routes/teamRoutes'
import fileRoutes from '@/routes/fileRoutes'
import notificationRoutes from '@/routes/notificationRoutes'
import analyticsRoutes from '@/routes/analyticsRoutes'
import webhookRoutes from '@/routes/webhookRoutes'
import healthRoutes from '@/routes/healthRoutes'

class App {
  public app: express.Application
  public server: http.Server
  public io: SocketIOServer

  constructor() {
    this.app = express()
    this.server = http.createServer(this.app)
    this.io = new SocketIOServer(this.server, {
      cors: {
        origin: config.cors.origin,
        credentials: true
      }
    })

    this.initializeMiddleware()
    this.initializeRoutes()
    this.initializeErrorHandling()
    this.initializeWebSocket()
    this.initializeCronJobs()
  }

  private initializeMiddleware(): void {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          fontSrc: ["'self'", "https://fonts.gstatic.com"],
          imgSrc: ["'self'", "data:", "https:"],
          scriptSrc: ["'self'"],
          objectSrc: ["'none'"],
          upgradeInsecureRequests: []
        }
      }
    }))

    // CORS configuration
    this.app.use(cors({
      origin: config.cors.origin,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin']
    }))

    // Rate limiting
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // limit each IP to 100 requests per windowMs
      message: 'Too many requests from this IP, please try again later.',
      standardHeaders: true,
      legacyHeaders: false
    })
    this.app.use(limiter)

    // Body parsing middleware
    this.app.use(express.json({ limit: '10mb' }))
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }))
    this.app.use(cookieParser())

    // Session configuration
    const redisStore = new (RedisStore as any)(redisClient)
    this.app.use(session({
      store: redisStore,
      secret: config.session.secret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: config.node.env === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
      }
    }))

    // Compression middleware
    this.app.use(compression())

    // Logging middleware
    if (config.node.env !== 'test') {
      this.app.use(morgan('combined', { stream: { write: (msg) => logger.info(msg.trim()) } }))
    }
    this.app.use(requestLogger)

    // Static file serving
    this.app.use('/uploads', express.static('uploads'))
    this.app.use('/docs', express.static('docs'))

    // API key validation for certain routes
    this.app.use('/api/webhooks', validateApiKey)

    // Swagger documentation
    if (config.node.env !== 'production') {
      setupSwagger(this.app)
    }

    // Bull dashboard for job monitoring
    if (config.node.env !== 'production') {
      setupBullDashboard(this.app)
    }
  }

  private initializeRoutes(): void {
    // Health check route
    this.app.use('/health', healthRoutes)

    // API routes
    this.app.use('/api/auth', authRoutes)
    this.app.use('/api/users', userRoutes)
    this.app.use('/api/projects', projectRoutes)
    this.app.use('/api/tasks', taskRoutes)
    this.app.use('/api/teams', teamRoutes)
    this.app.use('/api/files', fileRoutes)
    this.app.use('/api/notifications', notificationRoutes)
    this.app.use('/api/analytics', analyticsRoutes)
    this.app.use('/api/webhooks', webhookRoutes)

    // Default route
    this.app.get('/', (req, res) => {
      res.json({
        message: 'Welcome to Studious Couscous API',
        version: '1.0.0',
        environment: config.node.env,
        timestamp: new Date().toISOString(),
        documentation: config.node.env !== 'production' ? '/docs' : null
      })
    })
  }

  private initializeErrorHandling(): void {
    // 404 handler
    this.app.use(notFoundHandler)

    // Global error handler
    this.app.use(errorHandler)
  }

  private initializeWebSocket(): void {
    setupWebSocket(this.io)
  }

  private initializeCronJobs(): void {
    setupCronJobs()
  }

  public async start(): Promise<void> {
    try {
      // Connect to database
      await prisma.$connect()
      logger.info('Connected to PostgreSQL database')

      // Connect to Redis
      await redisClient.connect()
      logger.info('Connected to Redis')

      // Start server
      this.server.listen(config.server.port, () => {
        logger.info(`Server is running on port ${config.server.port}`)
        logger.info(`Environment: ${config.node.env}`)
        logger.info(`Documentation: http://localhost:${config.server.port}/docs`)
      })
    } catch (error) {
      logger.error('Failed to start server:', error)
      process.exit(1)
    }
  }

  public async stop(): Promise<void> {
    try {
      // Close server
      this.server.close()
      logger.info('Server closed')

      // Disconnect from database
      await prisma.$disconnect()
      logger.info('Disconnected from PostgreSQL database')

      // Disconnect from Redis
      await redisClient.quit()
      logger.info('Disconnected from Redis')
    } catch (error) {
      logger.error('Error during server shutdown:', error)
    }
  }
}

// Create and start the application
const app = new App()

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully')
  await app.stop()
  process.exit(0)
})

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully')
  await app.stop()
  process.exit(0)
})

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason)
  process.exit(1)
})

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error)
  process.exit(1)
})

// Start the application
app.start().catch((error) => {
  logger.error('Failed to start application:', error)
  process.exit(1)
})

export default app