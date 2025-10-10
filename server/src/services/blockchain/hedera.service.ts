/**
 * @file Implements a comprehensive service for interacting with the Hedera Hashgraph network.
 *
 * This service manages the Hedera client and mirror node connections, handles the creation
 * of Hedera Consensus Service (HCS) topics, and provides methods for submitting
 * and verifying data related to parts, orders, and users on the blockchain.
 */
import {
  Client,
  PrivateKey,
  AccountId,
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
  TopicInfoQuery,
  TopicId,
  TransactionResponse,
  TransactionReceipt,
  Hbar,
  Status,
  TransactionId,
  AccountCreateTransaction,
  AccountBalanceQuery,
  TransferTransaction,
  Timestamp,
  TopicMessage,
  TopicMessageQuery,
  ConsensusTopicId,
  Mirror,
  MirrorClient,
  MirrorSubscriptionHandle
} from '@hashgraph/sdk';
import { prisma } from '../../config/database';
import { logger } from '../../config/logger';
import { HederaEventType, HederaTransactionStatus } from '@prisma/client';
import { createHash } from 'crypto';

/**
 * @interface HederaConfig
 * @description Defines the configuration required to initialize the HederaService.
 */
export interface HederaConfig {
  operatorId: string;
  operatorKey: string;
  network: 'testnet' | 'mainnet';
  mirrorNodeUrl?: string;
}

/**
 * @interface PartProvenanceData
 * @description Defines the data structure for recording the provenance of an automotive part.
 */
export interface PartProvenanceData {
  partId: string;
  sku: string;
  manufacturerId: string;
  batchNumber?: string;
  serialNumber?: string;
  manufacturingDate?: Date;
  qualityChecks?: any[];
  certifications?: string[];
  supplierInfo?: any;
}

/**
 * @interface OrderAuditData
 * @description Defines the data structure for creating an audit trail for an order.
 */
export interface OrderAuditData {
  orderId: string;
  customerId: string;
  items: Array<{
    partId: string;
    quantity: number;
    unitPrice: number;
  }>;
  totalAmount: number;
  paymentMethod: string;
  timestamp: Date;
}

/**
 * @interface UserVerificationData
 * @description Defines the data structure for recording a user's verification status.
 */
export interface UserVerificationData {
  userId: string;
  businessType: string;
  verificationLevel: 'basic' | 'enhanced' | 'premium';
  documents: string[];
  verifiedAt: Date;
}

/**
 * @class HederaService
 * @description Provides a comprehensive service for all interactions with the Hedera network.
 */
export class HederaService {
  private client: Client;
  private mirrorClient: MirrorClient;
  private operatorId: AccountId;
  private operatorKey: PrivateKey;
  private partsTopicId?: TopicId;
  private ordersTopicId?: TopicId;
  private usersTopicId?: TopicId;

  /**
   * @constructor
   * @param {HederaConfig} config - The configuration object for the Hedera service.
   * @description Initializes the Hedera client and mirror node client based on the provided configuration.
   */
  constructor(config: HederaConfig) {
    this.operatorId = AccountId.fromString(config.operatorId);
    this.operatorKey = PrivateKey.fromString(config.operatorKey);

    // Initialize Hedera client
    if (config.network === 'testnet') {
      this.client = Client.forTestnet();
    } else {
      this.client = Client.forMainnet();
    }

    this.client.setOperator(this.operatorId, this.operatorKey);

    // Initialize Mirror Node client
    this.mirrorClient = new MirrorClient(
      config.mirrorNodeUrl || 'https://testnet.mirrornode.hedera.com'
    );
  }

  /**
   * Initializes the Hedera Consensus Service (HCS) topics required by the application.
   * This method creates topics for parts, orders, and users if they don't already exist.
   * @returns {Promise<void>}
   * @throws Will throw an error if topic initialization fails.
   */
  async initializeTopics(): Promise<void> {
    try {
      // Create topics for different event types
      this.partsTopicId = await this.createTopic('KC_PARTS_PROVENANCE');
      this.ordersTopicId = await this.createTopic('KC_ORDERS_AUDIT');
      this.usersTopicId = await this.createTopic('KC_USERS_VERIFICATION');

      logger.info('Hedera topics initialized successfully', {
        partsTopicId: this.partsTopicId?.toString(),
        ordersTopicId: this.ordersTopicId?.toString(),
        usersTopicId: this.usersTopicId?.toString()
      });
    } catch (error) {
      logger.error('Failed to initialize Hedera topics', error);
      throw error;
    }
  }

  /**
   * Creates a new Hedera Consensus Service (HCS) topic with a given memo.
   * @private
   * @param {string} memo - The memo to associate with the topic.
   * @returns {Promise<TopicId>} The ID of the newly created topic.
   * @throws Will throw an error if topic creation fails.
   */
  private async createTopic(memo: string): Promise<TopicId> {
    try {
      const transaction = new TopicCreateTransaction()
        .setTopicMemo(memo)
        .setMaxTransactionFee(new Hbar(2));

      const response = await transaction.execute(this.client);
      const receipt = await response.getReceipt(this.client);

      if (receipt.status !== Status.Success) {
        throw new Error(`Failed to create topic: ${receipt.status}`);
      }

      const topicId = receipt.topicId;
      if (!topicId) {
        throw new Error('Topic ID not found in receipt');
      }

      logger.info(`Created Hedera topic: ${topicId.toString()}`, { memo });
      return topicId;
    } catch (error) {
      logger.error('Failed to create Hedera topic', { memo, error });
      throw error;
    }
  }

  /**
   * Records part provenance data on the Hedera network.
   * This method serializes the part data, submits it as a message to the parts topic,
   * and updates the corresponding part record in the local database with the transaction ID.
   * @param {PartProvenanceData} data - The provenance data for the part.
   * @returns {Promise<string>} The Hedera transaction ID for the submitted message.
   * @throws Will throw an error if the parts topic is not initialized or if the submission fails.
   */
  async recordPartProvenance(data: PartProvenanceData): Promise<string> {
    try {
      if (!this.partsTopicId) {
        throw new Error('Parts topic not initialized');
      }

      const message = {
        type: 'PART_PROVENANCE',
        timestamp: new Date().toISOString(),
        data: data,
        hash: this.createDataHash(data)
      };

      const messageString = JSON.stringify(message);
      const transactionId = await this.submitMessage(
        this.partsTopicId,
        messageString,
        HederaEventType.PART_REGISTERED
      );

      // Update part in database with Hedera transaction ID
      await prisma.part.update({
        where: { id: data.partId },
        data: {
          isVerified: true,
          hederaTxId: transactionId,
          verifiedAt: new Date()
        }
      });

      logger.info('Part provenance recorded on Hedera', {
        partId: data.partId,
        transactionId
      });

      return transactionId;
    } catch (error) {
      logger.error('Failed to record part provenance', { data, error });
      throw error;
    }
  }

  /**
   * Records an order audit trail on the Hedera network.
   * This creates an immutable log of the order details at the time of creation.
   * @param {OrderAuditData} data - The audit data for the order.
   * @returns {Promise<string>} The Hedera transaction ID for the submitted message.
   * @throws Will throw an error if the orders topic is not initialized or if the submission fails.
   */
  async recordOrderAudit(data: OrderAuditData): Promise<string> {
    try {
      if (!this.ordersTopicId) {
        throw new Error('Orders topic not initialized');
      }

      const message = {
        type: 'ORDER_AUDIT',
        timestamp: new Date().toISOString(),
        data: data,
        hash: this.createDataHash(data)
      };

      const messageString = JSON.stringify(message);
      const transactionId = await this.submitMessage(
        this.ordersTopicId,
        messageString,
        HederaEventType.ORDER_CREATED
      );

      logger.info('Order audit recorded on Hedera', {
        orderId: data.orderId,
        transactionId
      });

      return transactionId;
    } catch (error) {
      logger.error('Failed to record order audit', { data, error });
      throw error;
    }
  }

  /**
   * Records user verification data on the Hedera network.
   * Sensitive document information is hashed before being included in the message.
   * @param {UserVerificationData} data - The verification data for the user.
   * @returns {Promise<string>} The Hedera transaction ID for the submitted message.
   * @throws Will throw an error if the users topic is not initialized or if the submission fails.
   */
  async recordUserVerification(data: UserVerificationData): Promise<string> {
    try {
      if (!this.usersTopicId) {
        throw new Error('Users topic not initialized');
      }

      const message = {
        type: 'USER_VERIFICATION',
        timestamp: new Date().toISOString(),
        data: {
          ...data,
          documents: data.documents.map(doc => this.createDataHash(doc)) // Hash sensitive data
        },
        hash: this.createDataHash(data)
      };

      const messageString = JSON.stringify(message);
      const transactionId = await this.submitMessage(
        this.usersTopicId,
        messageString,
        HederaEventType.USER_VERIFIED
      );

      logger.info('User verification recorded on Hedera', {
        userId: data.userId,
        transactionId
      });

      return transactionId;
    } catch (error) {
      logger.error('Failed to record user verification', { data, error });
      throw error;
    }
  }

  /**
   * Submits a message to a specified Hedera Consensus Service (HCS) topic.
   * This is a generic internal method used by the public-facing recording methods.
   * @private
   * @param {TopicId} topicId - The ID of the topic to submit the message to.
   * @param {string} message - The message content to submit, typically a JSON string.
   * @param {HederaEventType} eventType - The type of event being submitted.
   * @returns {Promise<string>} The transaction ID of the submission.
   * @throws Will throw an error if the message submission fails.
   */
  private async submitMessage(
    topicId: TopicId,
    message: string,
    eventType: HederaEventType
  ): Promise<string> {
    try {
      const transaction = new TopicMessageSubmitTransaction()
        .setTopicId(topicId)
        .setMessage(message)
        .setMaxTransactionFee(new Hbar(1));

      const response = await transaction.execute(this.client);
      const receipt = await response.getReceipt(this.client);

      if (receipt.status !== Status.Success) {
        throw new Error(`Failed to submit message: ${receipt.status}`);
      }

      const transactionId = response.transactionId.toString();
      const messageHash = this.createDataHash(message);

      // Store transaction in database
      await prisma.hederaTransaction.create({
        data: {
          transactionId,
          topicId: topicId.toString(),
          messageHash,
          eventType,
          entityId: this.extractEntityId(message),
          entityType: this.extractEntityType(message),
          status: HederaTransactionStatus.SUBMITTED,
          payload: JSON.parse(message)
        }
      });

      // Wait for consensus and update status
      this.waitForConsensus(transactionId, topicId);

      return transactionId;
    } catch (error) {
      logger.error('Failed to submit message to Hedera', { topicId, error });
      throw error;
    }
  }

  /**
   * Subscribes to a Hedera topic using a mirror node to wait for a transaction to reach consensus.
   * It updates the transaction's status in the local database upon consensus or failure.
   * @private
   * @param {string} transactionId - The ID of the transaction to monitor.
   * @param {TopicId} topicId - The topic to subscribe to.
   * @returns {Promise<void>}
   */
  private async waitForConsensus(
    transactionId: string,
    topicId: TopicId
  ): Promise<void> {
    try {
      // Subscribe to topic messages to detect consensus
      const subscriptionHandle = new TopicMessageQuery()
        .setTopicId(topicId)
        .setStartTime(Timestamp.fromDate(new Date(Date.now() - 60000))) // 1 minute ago
        .subscribe(this.mirrorClient, (message) => {
          // Check if this is our message
          if (message.consensusTimestamp) {
            this.updateTransactionStatus(
              transactionId,
              HederaTransactionStatus.CONSENSUS_REACHED,
              message.consensusTimestamp.toDate()
            );
          }
        });

      // Clean up subscription after 5 minutes
      setTimeout(() => {
        subscriptionHandle.unsubscribe();
      }, 300000);
    } catch (error) {
      logger.error('Failed to wait for consensus', { transactionId, error });
      // Update status to failed
      await this.updateTransactionStatus(
        transactionId,
        HederaTransactionStatus.FAILED
      );
    }
  }

  /**
   * Updates the status of a Hedera transaction in the local database.
   * @private
   * @param {string} transactionId - The ID of the transaction to update.
   * @param {HederaTransactionStatus} status - The new status of the transaction.
   * @param {Date} [consensusTimestamp] - The timestamp when consensus was reached.
   * @returns {Promise<void>}
   */
  private async updateTransactionStatus(
    transactionId: string,
    status: HederaTransactionStatus,
    consensusTimestamp?: Date
  ): Promise<void> {
    try {
      await prisma.hederaTransaction.update({
        where: { transactionId },
        data: {
          status,
          consensusTimestamp,
          updatedAt: new Date()
        }
      });
    } catch (error) {
      logger.error('Failed to update transaction status', {
        transactionId,
        status,
        error
      });
    }
  }

  /**
   * Verifies the authenticity of a part by checking its corresponding Hedera transaction.
   * @param {string} partId - The ID of the part to verify.
   * @returns {Promise<{ isAuthentic: boolean; provenanceData?: any; verificationTimestamp?: Date; }>} An object indicating authenticity and providing provenance data if available.
   */
  async verifyPartAuthenticity(partId: string): Promise<{
    isAuthentic: boolean;
    provenanceData?: any;
    verificationTimestamp?: Date;
  }> {
    try {
      const part = await prisma.part.findUnique({
        where: { id: partId },
        include: { manufacturer: true }
      });

      if (!part || !part.hederaTxId) {
        return { isAuthentic: false };
      }

      // Query Hedera for the transaction
      const hederaTransaction = await prisma.hederaTransaction.findUnique({
        where: { transactionId: part.hederaTxId }
      });

      if (!hederaTransaction || hederaTransaction.status !== HederaTransactionStatus.CONSENSUS_REACHED) {
        return { isAuthentic: false };
      }

      return {
        isAuthentic: true,
        provenanceData: hederaTransaction.payload,
        verificationTimestamp: hederaTransaction.consensusTimestamp || undefined
      };
    } catch (error) {
      logger.error('Failed to verify part authenticity', { partId, error });
      return { isAuthentic: false };
    }
  }

  /**
   * Retrieves the full audit trail for a specific entity (part, order, etc.) from the local database.
   * @param {string} entityId - The ID of the entity.
   * @param {string} entityType - The type of the entity.
   * @returns {Promise<any[]>} An array of transaction records for the entity.
   * @throws Will throw an error if the query fails.
   */
  async getAuditTrail(entityId: string, entityType: string): Promise<any[]> {
    try {
      const transactions = await prisma.hederaTransaction.findMany({
        where: {
          entityId,
          entityType,
          status: HederaTransactionStatus.CONSENSUS_REACHED
        },
        orderBy: { consensusTimestamp: 'asc' }
      });

      return transactions.map(tx => ({
        transactionId: tx.transactionId,
        eventType: tx.eventType,
        timestamp: tx.consensusTimestamp,
        data: tx.payload
      }));
    } catch (error) {
      logger.error('Failed to get audit trail', { entityId, entityType, error });
      throw error;
    }
  }

  /**
   * Creates a SHA-256 hash of the given data for integrity verification.
   * @private
   * @param {any} data - The data to hash.
   * @returns {string} The hexadecimal representation of the hash.
   */
  private createDataHash(data: any): string {
    const dataString = typeof data === 'string' ? data : JSON.stringify(data);
    return createHash('sha256').update(dataString).digest('hex');
  }

  /**
   * Extracts the entity ID from a message payload.
   * @private
   * @param {string} message - The JSON string message.
   * @returns {string} The extracted entity ID or 'unknown'.
   */
  private extractEntityId(message: string): string {
    try {
      const parsed = JSON.parse(message);
      return parsed.data.partId || parsed.data.orderId || parsed.data.userId || 'unknown';
    } catch {
      return 'unknown';
    }
  }

  /**
   * Extracts the entity type from a message payload.
   * @private
   * @param {string} message - The JSON string message.
   * @returns {string} The extracted entity type or 'unknown'.
   */
  private extractEntityType(message: string): string {
    try {
      const parsed = JSON.parse(message);
      if (parsed.data.partId) return 'part';
      if (parsed.data.orderId) return 'order';
      if (parsed.data.userId) return 'user';
      return 'unknown';
    } catch {
      return 'unknown';
    }
  }

  /**
   * Retrieves the HBAR balance of the operator account.
   * @returns {Promise<number>} The account balance in tinybars.
   * @throws Will throw an error if the balance query fails.
   */
  async getAccountBalance(): Promise<number> {
    try {
      const balance = await new AccountBalanceQuery()
        .setAccountId(this.operatorId)
        .execute(this.client);

      return balance.hbars.toTinybars().toNumber();
    } catch (error) {
      logger.error('Failed to get account balance', error);
      throw error;
    }
  }

  /**
   * Closes the connection to the Hedera client.
   * This should be called during a graceful shutdown of the application.
   * @returns {Promise<void>}
   */
  async close(): Promise<void> {
    await this.client.close();
  }
}

// Export singleton instance
export const hederaService = new HederaService({
  operatorId: process.env.HEDERA_OPERATOR_ID || '',
  operatorKey: process.env.HEDERA_OPERATOR_KEY || '',
  network: (process.env.HEDERA_NETWORK as 'testnet' | 'mainnet') || 'testnet',
  mirrorNodeUrl: process.env.HEDERA_MIRROR_NODE_URL
});