import { Client, PrivateKey, TopicCreateTransaction, TopicMessageSubmitTransaction, Hbar } from '@hashgraph/sdk'
import { logger } from '@/utils/logger'
import { config } from '@/config/environment'
import { prisma } from '@/config/database'
import { kafkaProducer } from '@/config/kafka'
import crypto from 'crypto'

interface HederaEvent {
  eventType: string
  entityId: string
  entityType: string
  payload: Record<string, any>
  timestamp: Date
}

interface PartProvenanceEvent {
  partId: string
  sku: string
  manufacturerId: string
  name: string
  price: number
  specifications?: Record<string, any>
  registeredBy: string
  timestamp: Date
}

interface OrderVerificationEvent {
  orderId: string
  orderNumber: string
  customerId: string
  total: number
  items: Array<{
    partId: string
    sku: string
    quantity: number
    unitPrice: number
  }>
  timestamp: Date
}

class HederaGatewayService {
  private client: Client
  private operatorKey: PrivateKey
  private topicIds: Map<string, string> = new Map()

  constructor() {
    this.initializeClient()
  }

  private initializeClient(): void {
    try {
      // Initialize Hedera client for testnet
      this.client = Client.forTestnet()
      
      // Set operator account
      const operatorId = config.hedera.operatorId
      const operatorPrivateKey = config.hedera.operatorPrivateKey
      
      if (!operatorId || !operatorPrivateKey) {
        throw new Error('Hedera operator credentials not configured')
      }

      this.operatorKey = PrivateKey.fromString(operatorPrivateKey)
      this.client.setOperator(operatorId, this.operatorKey)

      // Set default max transaction fee
      this.client.setDefaultMaxTransactionFee(new Hbar(100))

      logger.info('Hedera Gateway Service initialized successfully')
    } catch (error) {
      logger.error('Failed to initialize Hedera client:', error)
      throw error
    }
  }

  /**
   * Create HCS topics for different event types
   */
  async initializeTopics(): Promise<void> {
    try {
      const topics = [
        { name: 'part.provenance', memo: 'KC Speedshop Part Provenance Verification' },
        { name: 'order.verification', memo: 'KC Speedshop Order Verification' },
        { name: 'user.verification', memo: 'KC Speedshop User Verification' },
      ]

      for (const topic of topics) {
        const topicId = await this.createTopic(topic.name, topic.memo)
        this.topicIds.set(topic.name, topicId)
        logger.info(`Created Hedera topic: ${topic.name} with ID: ${topicId}`)
      }
    } catch (error) {
      logger.error('Failed to initialize Hedera topics:', error)
      throw error
    }
  }

  /**
   * Create a new HCS topic
   */
  private async createTopic(name: string, memo: string): Promise<string> {
    try {
      const transaction = new TopicCreateTransaction()
        .setTopicMemo(memo)
        .setAdminKey(this.operatorKey.publicKey)
        .setSubmitKey(this.operatorKey.publicKey)

      const txResponse = await transaction.execute(this.client)
      const receipt = await txResponse.getReceipt(this.client)
      
      return receipt.topicId!.toString()
    } catch (error) {
      logger.error(`Failed to create topic ${name}:`, error)
      throw error
    }
  }

  /**
   * Submit a part provenance event to Hedera
   */
  async submitPartProvenance(event: PartProvenanceEvent): Promise<string> {
    try {
      const topicId = this.topicIds.get('part.provenance')
      if (!topicId) {
        throw new Error('Part provenance topic not initialized')
      }

      // Create standardized payload
      const payload = {
        version: '1.0',
        eventType: 'PART_REGISTERED',
        entityId: event.partId,
        entityType: 'part',
        data: {
          sku: event.sku,
          name: event.name,
          manufacturerId: event.manufacturerId,
          price: event.price,
          specifications: event.specifications,
          registeredBy: event.registeredBy,
          timestamp: event.timestamp.toISOString(),
        },
        hash: this.generateEventHash(event),
      }

      const message = JSON.stringify(payload)
      const messageHash = crypto.createHash('sha256').update(message).digest('hex')

      // Submit to Hedera
      const transaction = new TopicMessageSubmitTransaction()
        .setTopicId(topicId)
        .setMessage(message)

      const txResponse = await transaction.execute(this.client)
      const receipt = await txResponse.getReceipt(this.client)
      const transactionId = txResponse.transactionId.toString()

      // Store in database
      await prisma.hederaTransaction.create({
        data: {
          transactionId,
          topicId,
          messageHash,
          eventType: 'PART_REGISTERED',
          entityId: event.partId,
          entityType: 'part',
          consensusTimestamp: receipt.consensusTimestamp?.toDate(),
          status: 'CONSENSUS_REACHED',
          payload: payload as any,
        },
      })

      // Update part with verification status
      await prisma.part.update({
        where: { id: event.partId },
        data: {
          isVerified: true,
          hederaTxId: transactionId,
          verifiedAt: new Date(),
        },
      })

      // Publish success event back to Kafka
      await kafkaProducer.send({
        topic: 'automotive.parts.verified',
        messages: [{
          key: event.partId,
          value: JSON.stringify({
            partId: event.partId,
            hederaTxId: transactionId,
            verifiedAt: new Date().toISOString(),
          }),
        }],
      })

      logger.info(`Part provenance submitted to Hedera: ${transactionId}`)
      return transactionId
    } catch (error) {
      logger.error('Failed to submit part provenance to Hedera:', error)
      
      // Record failure in database
      await prisma.hederaTransaction.create({
        data: {
          transactionId: `failed-${Date.now()}`,
          topicId: this.topicIds.get('part.provenance') || 'unknown',
          messageHash: 'failed',
          eventType: 'PART_REGISTERED',
          entityId: event.partId,
          entityType: 'part',
          status: 'FAILED',
          payload: { error: error.message } as any,
        },
      })

      throw error
    }
  }

  /**
   * Submit an order verification event to Hedera
   */
  async submitOrderVerification(event: OrderVerificationEvent): Promise<string> {
    try {
      const topicId = this.topicIds.get('order.verification')
      if (!topicId) {
        throw new Error('Order verification topic not initialized')
      }

      const payload = {
        version: '1.0',
        eventType: 'ORDER_CREATED',
        entityId: event.orderId,
        entityType: 'order',
        data: {
          orderNumber: event.orderNumber,
          customerId: event.customerId,
          total: event.total,
          itemCount: event.items.length,
          items: event.items,
          timestamp: event.timestamp.toISOString(),
        },
        hash: this.generateEventHash(event),
      }

      const message = JSON.stringify(payload)
      const messageHash = crypto.createHash('sha256').update(message).digest('hex')

      const transaction = new TopicMessageSubmitTransaction()
        .setTopicId(topicId)
        .setMessage(message)

      const txResponse = await transaction.execute(this.client)
      const receipt = await txResponse.getReceipt(this.client)
      const transactionId = txResponse.transactionId.toString()

      // Store in database
      await prisma.hederaTransaction.create({
        data: {
          transactionId,
          topicId,
          messageHash,
          eventType: 'ORDER_CREATED',
          entityId: event.orderId,
          entityType: 'order',
          consensusTimestamp: receipt.consensusTimestamp?.toDate(),
          status: 'CONSENSUS_REACHED',
          payload: payload as any,
        },
      })

      logger.info(`Order verification submitted to Hedera: ${transactionId}`)
      return transactionId
    } catch (error) {
      logger.error('Failed to submit order verification to Hedera:', error)
      throw error
    }
  }

  /**
   * Process HBAR payment
   */
  async processHbarPayment(
    fromAccountId: string,
    toAccountId: string,
    amount: number,
    orderId: string
  ): Promise<string> {
    try {
      // This would typically be handled by the client-side application
      // The server would verify the transaction after it's submitted
      
      // For now, we'll just record the payment intent
      logger.info(`HBAR payment initiated: ${amount} HBAR from ${fromAccountId} to ${toAccountId} for order ${orderId}`)
      
      // In a real implementation, you would:
      // 1. Validate the transaction on Hedera
      // 2. Update the order payment status
      // 3. Trigger order fulfillment
      
      return `hbar-payment-${Date.now()}`
    } catch (error) {
      logger.error('Failed to process HBAR payment:', error)
      throw error
    }
  }

  /**
   * Verify a Hedera transaction
   */
  async verifyTransaction(transactionId: string): Promise<boolean> {
    try {
      // Query Hedera mirror node or consensus node to verify transaction
      // This is a simplified implementation
      const transaction = await prisma.hederaTransaction.findUnique({
        where: { transactionId },
      })

      return transaction?.status === 'CONSENSUS_REACHED'
    } catch (error) {
      logger.error('Failed to verify Hedera transaction:', error)
      return false
    }
  }

  /**
   * Get transaction history for an entity
   */
  async getTransactionHistory(entityId: string, entityType: string) {
    try {
      return await prisma.hederaTransaction.findMany({
        where: {
          entityId,
          entityType,
        },
        orderBy: {
          createdAt: 'desc',
        },
      })
    } catch (error) {
      logger.error('Failed to get transaction history:', error)
      throw error
    }
  }

  /**
   * Generate a hash for an event to ensure integrity
   */
  private generateEventHash(event: any): string {
    const eventString = JSON.stringify(event, Object.keys(event).sort())
    return crypto.createHash('sha256').update(eventString).digest('hex')
  }

  /**
   * Close the Hedera client connection
   */
  async close(): Promise<void> {
    try {
      this.client.close()
      logger.info('Hedera Gateway Service closed')
    } catch (error) {
      logger.error('Error closing Hedera Gateway Service:', error)
    }
  }
}

// Export singleton instance
export const hederaGatewayService = new HederaGatewayService()

// Export types for use in other modules
export type { HederaEvent, PartProvenanceEvent, OrderVerificationEvent }