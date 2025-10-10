/**
 * @file Provides a gateway service for interacting with the Hedera Hashgraph network.
 *
 * This service encapsulates all the logic for connecting to the Hedera network,
 * creating and managing topics on the Hedera Consensus Service (HCS),
 * submitting events for part provenance and order verification, and querying
 * transaction history.
 */
import { Client, PrivateKey, TopicCreateTransaction, TopicMessageSubmitTransaction, Hbar } from '@hashgraph/sdk'
import { logger } from '@/utils/logger'
import { config } from '@/config/environment'
import { prisma } from '@/config/database'
import { kafkaProducer } from '@/config/kafka'
import crypto from 'crypto'

/**
 * @interface HederaEvent
 * @description A generic interface for events being sent to the Hedera network.
 */
interface HederaEvent {
  eventType: string
  entityId: string
  entityType: string
  payload: Record<string, any>
  timestamp: Date
}

/**
 * @interface PartProvenanceEvent
 * @description Defines the structure for a part provenance event to be recorded on the blockchain.
 */
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

/**
 * @interface OrderVerificationEvent
 * @description Defines the structure for an order verification event to be recorded on the blockchain.
 */
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

/**
 * @class HederaGatewayService
 * @description Manages all interactions with the Hedera Hashgraph network.
 */
class HederaGatewayService {
  private client: Client
  private operatorKey: PrivateKey
  private topicIds: Map<string, string> = new Map()

  /**
   * @constructor
   * @description Initializes the Hedera client upon instantiation.
   */
  constructor() {
    this.initializeClient()
  }

  /**
   * Initializes the Hedera client with credentials from the environment configuration.
   * @private
   * @throws Will throw an error if the Hedera client fails to initialize.
   */
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
   * Creates the necessary Hedera Consensus Service (HCS) topics for the application.
   * This should be called during application startup.
   * @returns {Promise<void>}
   * @throws Will throw an error if topic creation fails.
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
   * Creates a single new HCS topic.
   * @private
   * @param {string} name - The internal name for the topic.
   * @param {string} memo - The public memo for the topic on the Hedera network.
   * @returns {Promise<string>} The ID of the newly created topic.
   * @throws Will throw an error if topic creation fails.
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
   * Submits a part provenance event to the Hedera Consensus Service.
   * This creates an immutable, verifiable record of a part's registration.
   * On success, it updates the part's status in the local database and publishes a Kafka event.
   * @param {PartProvenanceEvent} event - The part provenance data to submit.
   * @returns {Promise<string>} The Hedera transaction ID.
   * @throws Will throw an error if the submission fails.
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
   * Submits an order verification event to the Hedera Consensus Service.
   * This creates an immutable record of an order's details at the time of creation.
   * @param {OrderVerificationEvent} event - The order verification data to submit.
   * @returns {Promise<string>} The Hedera transaction ID.
   * @throws Will throw an error if the submission fails.
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
   * Simulates the processing of a payment made in HBAR.
   * Note: In a real-world scenario, payment submission would be client-side,
   * and this service would only verify the transaction's consensus.
   * @param {string} fromAccountId - The account ID of the sender.
   * @param {string} toAccountId - The account ID of the recipient.
   * @param {number} amount - The amount of HBAR transferred.
   * @param {string} orderId - The ID of the order this payment is for.
   * @returns {Promise<string>} A mock payment transaction ID.
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
   * Verifies a Hedera transaction by checking its status in the local database.
   * A more robust implementation would query a Hedera mirror node.
   * @param {string} transactionId - The ID of the transaction to verify.
   * @returns {Promise<boolean>} True if the transaction has reached consensus, false otherwise.
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
   * Retrieves the recorded Hedera transaction history for a specific entity from the local database.
   * @param {string} entityId - The ID of the entity (e.g., part ID, order ID).
   * @param {string} entityType - The type of the entity (e.g., 'part', 'order').
   * @returns {Promise<any[]>} A promise that resolves with an array of transaction records.
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
   * Generates a SHA-256 hash of a given event object to ensure data integrity.
   * The object is stringified with sorted keys to ensure a consistent hash.
   * @private
   * @param {any} event - The event object to hash.
   * @returns {string} The resulting hexadecimal hash string.
   */
  private generateEventHash(event: any): string {
    const eventString = JSON.stringify(event, Object.keys(event).sort())
    return crypto.createHash('sha256').update(eventString).digest('hex')
  }

  /**
   * Closes the connection to the Hedera client.
   * This should be called during graceful shutdown of the application.
   * @returns {Promise<void>}
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