import { Kafka, Producer, Consumer, KafkaConfig } from 'kafkajs'
import { config } from './environment'
import { logger } from '@/utils/logger'

// Kafka configuration
const kafkaConfig: KafkaConfig = {
  clientId: config.kafka.clientId,
  brokers: config.kafka.brokers,
  retry: {
    initialRetryTime: 100,
    retries: 8,
  },
  logLevel: config.node.isDevelopment ? 2 : 1, // INFO in dev, WARN in prod
}

// Initialize Kafka client
export const kafka = new Kafka(kafkaConfig)

// Initialize producer
export const kafkaProducer = kafka.producer({
  maxInFlightRequests: 1,
  idempotent: true,
  transactionTimeout: 30000,
})

// Initialize consumers for different services
export const createConsumer = (groupId: string): Consumer => {
  return kafka.consumer({
    groupId,
    sessionTimeout: 30000,
    rebalanceTimeout: 60000,
    heartbeatInterval: 3000,
  })
}

// Topic names for the automotive platform
export const KAFKA_TOPICS = {
  // Parts management
  PARTS_REGISTERED: 'automotive.parts.registered',
  PARTS_VERIFIED: 'automotive.parts.verified',
  PARTS_UPDATED: 'automotive.parts.updated',
  
  // Orders
  ORDER_CREATED: 'automotive.orders.created',
  ORDER_PAID: 'automotive.orders.paid',
  ORDER_SHIPPED: 'automotive.orders.shipped',
  ORDER_DELIVERED: 'automotive.orders.delivered',
  
  // Users & CRM
  USER_CREATED: 'automotive.users.created',
  USER_UPDATED: 'automotive.users.updated',
  USER_VERIFIED: 'automotive.users.verified',
  CRM_SYNC_REQUEST: 'automotive.crm.sync.request',
  CRM_SYNC_COMPLETE: 'automotive.crm.sync.complete',
  
  // Support
  SUPPORT_TICKET_CREATED: 'automotive.support.ticket.created',
  SUPPORT_TICKET_UPDATED: 'automotive.support.ticket.updated',
  
  // Financial
  INVOICE_CREATED: 'automotive.finance.invoice.created',
  PAYMENT_RECEIVED: 'automotive.finance.payment.received',
  FINANCE_SYNC_REQUEST: 'automotive.finance.sync.request',
  
  // Compliance & Security
  AML_CHECK_REQUEST: 'automotive.compliance.aml.check.request',
  AML_CHECK_COMPLETE: 'automotive.compliance.aml.check.complete',
  RISK_ASSESSMENT: 'automotive.compliance.risk.assessment',
  
  // Hedera blockchain events
  HEDERA_TRANSACTION_PENDING: 'automotive.hedera.transaction.pending',
  HEDERA_TRANSACTION_COMPLETE: 'automotive.hedera.transaction.complete',
  HEDERA_TRANSACTION_FAILED: 'automotive.hedera.transaction.failed',
} as const

// Initialize Kafka connections
export const initializeKafka = async (): Promise<void> => {
  try {
    // Connect producer
    await kafkaProducer.connect()
    logger.info('Kafka producer connected successfully')

    // Create admin client for topic management
    const admin = kafka.admin()
    await admin.connect()

    // Create topics if they don't exist
    const topicConfigs = Object.values(KAFKA_TOPICS).map(topic => ({
      topic,
      numPartitions: 3,
      replicationFactor: 1,
      configEntries: [
        { name: 'cleanup.policy', value: 'compact' },
        { name: 'retention.ms', value: '86400000' }, // 24 hours
      ],
    }))

    await admin.createTopics({
      topics: topicConfigs,
      waitForLeaders: true,
    })

    await admin.disconnect()
    logger.info('Kafka topics created/verified successfully')
  } catch (error) {
    logger.error('Failed to initialize Kafka:', error)
    throw error
  }
}

// Gracefully shutdown Kafka connections
export const shutdownKafka = async (): Promise<void> => {
  try {
    await kafkaProducer.disconnect()
    logger.info('Kafka connections closed')
  } catch (error) {
    logger.error('Error shutting down Kafka:', error)
  }
}

// Helper function to publish events
export const publishEvent = async (
  topic: string,
  key: string,
  value: Record<string, any>,
  headers?: Record<string, string>
): Promise<void> => {
  try {
    await kafkaProducer.send({
      topic,
      messages: [{
        key,
        value: JSON.stringify(value),
        headers,
        timestamp: Date.now().toString(),
      }],
    })
    
    logger.debug(`Event published to ${topic}:`, { key, value })
  } catch (error) {
    logger.error(`Failed to publish event to ${topic}:`, error)
    throw error
  }
}

// Event type definitions
export interface BaseEvent {
  eventId: string
  eventType: string
  timestamp: string
  version: string
  source: string
}

export interface PartRegisteredEvent extends BaseEvent {
  eventType: 'PART_REGISTERED'
  data: {
    partId: string
    sku: string
    name: string
    manufacturerId: string
    categoryId: string
    price: number
    registeredBy: string
  }
}

export interface OrderCreatedEvent extends BaseEvent {
  eventType: 'ORDER_CREATED'
  data: {
    orderId: string
    orderNumber: string
    customerId: string
    total: number
    currency: string
    itemCount: number
  }
}

export interface UserCreatedEvent extends BaseEvent {
  eventType: 'USER_CREATED'
  data: {
    userId: string
    email: string
    firstName: string
    lastName: string
    businessType: string
    companyName?: string
  }
}

export interface CrmSyncRequestEvent extends BaseEvent {
  eventType: 'CRM_SYNC_REQUEST'
  data: {
    entityType: 'user' | 'contact' | 'ticket'
    entityId: string
    operation: 'create' | 'update' | 'delete'
    targetCrm: 'salesforce' | 'hubspot'
    payload: Record<string, any>
  }
}

export interface AmlCheckRequestEvent extends BaseEvent {
  eventType: 'AML_CHECK_REQUEST'
  data: {
    orderId: string
    walletAddress: string
    amount: number
    currency: string
    customerId: string
  }
}

// Type union for all events
export type KafkaEvent = 
  | PartRegisteredEvent
  | OrderCreatedEvent
  | UserCreatedEvent
  | CrmSyncRequestEvent
  | AmlCheckRequestEvent