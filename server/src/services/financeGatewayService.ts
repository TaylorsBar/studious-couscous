/**
 * @file Provides a gateway service for synchronizing financial data with external accounting systems.
 *
 * This service uses a generic adapter pattern to support multiple financial platforms (e.g., Xero, MYOB).
 * It consumes Kafka events for orders, invoices, and payments, and translates them into API calls
 * for the respective accounting systems. It also handles financial reconciliation.
 */
import { logger } from '@/utils/logger'
import { config } from '@/config/environment'
import { prisma } from '@/config/database'
import { createConsumer, publishEvent, KAFKA_TOPICS } from '@/config/kafka'
import { Consumer } from 'kafkajs'

/**
 * @interface CanonicalInvoice
 * @description A standardized data model for an invoice, abstracting away system-specific fields.
 */
interface CanonicalInvoice {
  platformInvoiceId: string
  invoiceNumber: string
  customerId: string
  customerEmail: string
  customerName: string
  lineItems: Array<{
    description: string
    quantity: number
    unitPrice: number
    totalPrice: number
    taxAmount?: number
  }>
  subtotal: number
  taxTotal: number
  total: number
  currency: string
  issueDate: Date
  dueDate?: Date
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled'
}

/**
 * @interface CanonicalPayment
 * @description A standardized data model for a payment, abstracting away system-specific fields.
 */
interface CanonicalPayment {
  platformPaymentId: string
  invoiceId: string
  amount: number
  currency: string
  paymentMethod: 'credit_card' | 'bank_transfer' | 'hbar' | 'cash'
  paymentDate: Date
  reference?: string
  gatewayTransactionId?: string
}

/**
 * @abstract
 * @class FinanceAdapter
 * @description Defines the interface that all financial system adapters must implement.
 * This ensures that the FinanceGatewayService can interact with any system in a consistent way.
 */
abstract class FinanceAdapter {
  /** Connects to the financial system API. */
  abstract connect(): Promise<void>
  /** Disconnects from the financial system API. */
  abstract disconnect(): Promise<void>
  /** Creates a new invoice in the financial system. */
  abstract createInvoice(invoice: CanonicalInvoice): Promise<string>
  /** Updates an existing invoice in the financial system. */
  abstract updateInvoice(externalId: string, invoice: CanonicalInvoice): Promise<void>
  /** Records a payment against an invoice in the financial system. */
  abstract recordPayment(payment: CanonicalPayment): Promise<string>
  /** Synchronizes a platform invoice's data with the financial system. */
  abstract syncInvoice(platformInvoiceId: string): Promise<void>
  /** Retrieves reconciled transactions from the financial system for a given period. */
  abstract getReconciledTransactions(startDate: Date, endDate: Date): Promise<any[]>
}

/**
 * @class XeroAdapter
 * @extends FinanceAdapter
 * @description Provides the concrete implementation for interacting with the Xero API.
 * Note: This implementation is a mock and does not make real API calls.
 */
class XeroAdapter extends FinanceAdapter {
  private isConnected = false
  private accessToken?: string

  /**
   * Simulates a connection to the Xero API.
   * In a real implementation, this would handle the OAuth2 flow.
   * @returns {Promise<void>}
   * @throws Will throw an error if credentials are not configured.
   */
  async connect(): Promise<void> {
    try {
      if (!config.finance.xero.clientId || !config.finance.xero.clientSecret) {
        throw new Error('Xero credentials not configured')
      }

      // In a real implementation, you would implement OAuth2 flow
      // For now, we'll simulate a connection
      this.isConnected = true
      logger.info('Connected to Xero successfully')
    } catch (error) {
      logger.error('Failed to connect to Xero:', error)
      throw error
    }
  }

  /**
   * Simulates a disconnection from the Xero API.
   * @returns {Promise<void>}
   */
  async disconnect(): Promise<void> {
    this.isConnected = false
    this.accessToken = undefined
    logger.info('Disconnected from Xero')
  }

  /**
   * Creates a new invoice in Xero.
   * @param {CanonicalInvoice} invoice - The standardized invoice data.
   * @returns {Promise<string>} The mock ID of the newly created Xero invoice.
   * @throws Will throw an error if invoice creation fails.
   */
  async createInvoice(invoice: CanonicalInvoice): Promise<string> {
    try {
      if (!this.isConnected) await this.connect()

      // Map to Xero invoice format
      const xeroInvoice = {
        Type: 'ACCREC', // Accounts Receivable
        Contact: {
          Name: invoice.customerName,
          EmailAddress: invoice.customerEmail,
        },
        InvoiceNumber: invoice.invoiceNumber,
        Date: invoice.issueDate.toISOString().split('T')[0],
        DueDate: invoice.dueDate?.toISOString().split('T')[0],
        Status: this.mapInvoiceStatus(invoice.status),
        CurrencyCode: invoice.currency,
        LineItems: invoice.lineItems.map(item => ({
          Description: item.description,
          Quantity: item.quantity,
          UnitAmount: item.unitPrice,
          AccountCode: '200', // Revenue account
          TaxType: item.taxAmount ? 'OUTPUT' : 'NONE',
        })),
        Reference: `KC-${invoice.platformInvoiceId}`,
      }

      // In a real implementation, you would use the Xero SDK
      const mockXeroId = `INV-${Date.now()}`
      
      logger.info(`Created Xero invoice: ${mockXeroId}`)
      return mockXeroId
    } catch (error) {
      logger.error('Failed to create Xero invoice:', error)
      throw error
    }
  }

  /**
   * Updates an existing invoice in Xero.
   * @param {string} externalId - The Xero ID of the invoice to update.
   * @param {CanonicalInvoice} invoice - The updated invoice data.
   * @returns {Promise<void>}
   */
  async updateInvoice(externalId: string, invoice: CanonicalInvoice): Promise<void> {
    try {
      if (!this.isConnected) await this.connect()

      // Update logic would go here
      logger.info(`Updated Xero invoice: ${externalId}`)
    } catch (error) {
      logger.error('Failed to update Xero invoice:', error)
      throw error
    }
  }

  /**
   * Records a payment against an invoice in Xero.
   * @param {CanonicalPayment} payment - The standardized payment data.
   * @returns {Promise<string>} The mock ID of the newly created Xero payment.
   * @throws Will throw an error if payment recording fails.
   */
  async recordPayment(payment: CanonicalPayment): Promise<string> {
    try {
      if (!this.isConnected) await this.connect()

      const xeroPayment = {
        Invoice: {
          InvoiceID: payment.invoiceId, // This would be the Xero invoice ID
        },
        Account: {
          Code: this.getAccountCodeForPaymentMethod(payment.paymentMethod),
        },
        Amount: payment.amount,
        Date: payment.paymentDate.toISOString().split('T')[0],
        Reference: payment.reference || payment.platformPaymentId,
      }

      const mockPaymentId = `PAY-${Date.now()}`
      
      logger.info(`Recorded Xero payment: ${mockPaymentId}`)
      return mockPaymentId
    } catch (error) {
      logger.error('Failed to record Xero payment:', error)
      throw error
    }
  }

  /**
   * Synchronizes an invoice from the local database to Xero.
   * Creates a new invoice in Xero if it doesn't exist, otherwise updates it.
   * @param {string} platformInvoiceId - The ID of the invoice on the local platform.
   * @returns {Promise<void>}
   * @throws Will throw an error if the invoice is not found or sync fails.
   */
  async syncInvoice(platformInvoiceId: string): Promise<void> {
    try {
      const invoice = await prisma.invoice.findUnique({
        where: { id: platformInvoiceId },
        include: {
          customer: true,
          order: {
            include: {
              items: {
                include: {
                  part: true,
                },
              },
            },
          },
        },
      })

      if (!invoice) {
        throw new Error(`Invoice not found: ${platformInvoiceId}`)
      }

      const canonicalInvoice: CanonicalInvoice = {
        platformInvoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        customerId: invoice.customerId,
        customerEmail: invoice.customer.email,
        customerName: `${invoice.customer.firstName} ${invoice.customer.lastName}`,
        lineItems: invoice.order?.items.map(item => ({
          description: `${item.part.name} (SKU: ${item.part.sku})`,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: item.lineTotal,
        })) || [],
        subtotal: invoice.subtotal,
        taxTotal: invoice.tax,
        total: invoice.total,
        currency: 'USD',
        issueDate: invoice.createdAt,
        dueDate: invoice.dueDate || undefined,
        status: this.mapInternalStatus(invoice.status),
      }

      let externalId: string

      if (invoice.xeroId) {
        await this.updateInvoice(invoice.xeroId, canonicalInvoice)
        externalId = invoice.xeroId
      } else {
        externalId = await this.createInvoice(canonicalInvoice)
        
        await prisma.invoice.update({
          where: { id: platformInvoiceId },
          data: {
            xeroId: externalId,
            syncedAt: new Date(),
          },
        })
      }

      logger.info(`Synced invoice ${platformInvoiceId} with Xero: ${externalId}`)
    } catch (error) {
      logger.error('Failed to sync invoice with Xero:', error)
      throw error
    }
  }

  /**
   * Retrieves a mock list of reconciled transactions from Xero.
   * @param {Date} startDate - The start date for the transaction period.
   * @param {Date} endDate - The end date for the transaction period.
   * @returns {Promise<any[]>} A promise that resolves with an array of mock transactions.
   */
  async getReconciledTransactions(startDate: Date, endDate: Date): Promise<any[]> {
    try {
      if (!this.isConnected) await this.connect()

      // In a real implementation, you would fetch bank transactions from Xero
      const mockTransactions = [
        {
          date: new Date(),
          amount: 1250.00,
          description: 'KC Speedshop - Turbo Kit Payment',
          reference: 'KC-ORD-123456',
          accountCode: '090', // Bank account
        },
      ]

      logger.info(`Retrieved ${mockTransactions.length} reconciled transactions from Xero`)
      return mockTransactions
    } catch (error) {
      logger.error('Failed to get reconciled transactions from Xero:', error)
      throw error
    }
  }

  /**
   * Maps an internal platform status to a Xero-compatible invoice status.
   * @private
   * @param {string} status - The internal status.
   * @returns {string} The corresponding Xero status.
   */
  private mapInvoiceStatus(status: string): string {
    const mapping: Record<string, string> = {
      'draft': 'DRAFT',
      'sent': 'SUBMITTED',
      'paid': 'PAID',
      'overdue': 'SUBMITTED',
      'cancelled': 'VOIDED',
    }
    return mapping[status] || 'DRAFT'
  }

  /**
   * Maps a Xero invoice status back to an internal platform status.
   * @private
   * @param {string} status - The Xero status.
   * @returns {string} The corresponding internal status.
   */
  private mapInternalStatus(status: string): 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled' {
    const mapping: Record<string, 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled'> = {
      'DRAFT': 'draft',
      'SENT': 'sent',
      'VIEWED': 'sent',
      'PAID': 'paid',
      'OVERDUE': 'overdue',
      'CANCELLED': 'cancelled',
    }
    return mapping[status] || 'draft'
  }

  /**
   * Gets the appropriate Xero account code based on the payment method.
   * @private
   * @param {string} paymentMethod - The payment method used.
   * @returns {string} The corresponding Xero account code.
   */
  private getAccountCodeForPaymentMethod(paymentMethod: string): string {
    const mapping: Record<string, string> = {
      'credit_card': '091', // Credit card clearing account
      'bank_transfer': '090', // Main bank account
      'hbar': '092', // Crypto asset account
      'cash': '093', // Cash account
    }
    return mapping[paymentMethod] || '090'
  }
}

/**
 * @class MyobAdapter
 * @extends FinanceAdapter
 * @description Provides a mock implementation for interacting with the MYOB API.
 */
class MyobAdapter extends FinanceAdapter {
  private isConnected = false

  /**
   * Simulates a connection to the MYOB API.
   * @returns {Promise<void>}
   */
  async connect(): Promise<void> {
    try {
      if (!config.finance.myob.clientId || !config.finance.myob.clientSecret) {
        throw new Error('MYOB credentials not configured')
      }

      // OAuth2 flow implementation would go here
      this.isConnected = true
      logger.info('Connected to MYOB successfully')
    } catch (error) {
      logger.error('Failed to connect to MYOB:', error)
      throw error
    }
  }

  /**
   * Simulates a disconnection from the MYOB API.
   * @returns {Promise<void>}
   */
  async disconnect(): Promise<void> {
    this.isConnected = false
    logger.info('Disconnected from MYOB')
  }

  /**
   * Simulates creating a new invoice in MYOB.
   * @param {CanonicalInvoice} invoice - The standardized invoice data.
   * @returns {Promise<string>} The mock ID of the newly created MYOB invoice.
   */
  async createInvoice(invoice: CanonicalInvoice): Promise<string> {
    try {
      if (!this.isConnected) await this.connect()

      // MYOB-specific invoice creation logic
      const mockMyobId = `MYOB-INV-${Date.now()}`
      
      logger.info(`Created MYOB invoice: ${mockMyobId}`)
      return mockMyobId
    } catch (error) {
      logger.error('Failed to create MYOB invoice:', error)
      throw error
    }
  }

  /**
   * Simulates updating an invoice in MYOB.
   * @param {string} externalId - The MYOB ID of the invoice.
   * @param {CanonicalInvoice} invoice - The updated invoice data.
   * @returns {Promise<void>}
   */
  async updateInvoice(externalId: string, invoice: CanonicalInvoice): Promise<void> {
    logger.info(`Updated MYOB invoice: ${externalId}`)
  }

  /**
   * Simulates recording a payment in MYOB.
   * @param {CanonicalPayment} payment - The standardized payment data.
   * @returns {Promise<string>} The mock ID of the recorded payment.
   */
  async recordPayment(payment: CanonicalPayment): Promise<string> {
    const mockPaymentId = `MYOB-PAY-${Date.now()}`
    logger.info(`Recorded MYOB payment: ${mockPaymentId}`)
    return mockPaymentId
  }

  /**
   * Simulates synchronizing an invoice with MYOB.
   * @param {string} platformInvoiceId - The local platform's invoice ID.
   * @returns {Promise<void>}
   */
  async syncInvoice(platformInvoiceId: string): Promise<void> {
    logger.info(`Syncing invoice ${platformInvoiceId} with MYOB`)
  }

  /**
   * Returns an empty array for reconciled transactions as a mock response.
   * @returns {Promise<any[]>} An empty array.
   */
  async getReconciledTransactions(startDate: Date, endDate: Date): Promise<any[]> {
    return []
  }
}

/**
 * @class FinanceGatewayService
 * @description Orchestrates financial data synchronization between the platform and various accounting systems.
 */
class FinanceGatewayService {
  private adapters: Map<string, FinanceAdapter> = new Map()
  private consumer: Consumer
  private isRunning = false

  /**
   * @constructor
   * @description Initializes the financial adapters and the Kafka consumer.
   */
  constructor() {
    this.adapters.set('xero', new XeroAdapter())
    this.adapters.set('myob', new MyobAdapter())
    this.consumer = createConsumer('finance-gateway-service')
  }

  /**
   * Starts the finance gateway service, connecting to accounting systems and Kafka.
   * @returns {Promise<void>}
   */
  async start(): Promise<void> {
    try {
      // Connect to finance systems
      for (const [name, adapter] of this.adapters) {
        try {
          await adapter.connect()
          logger.info(`Connected to ${name}`)
        } catch (error) {
          logger.warn(`Failed to connect to ${name}, will retry later:`, error)
        }
      }

      // Start Kafka consumer
      await this.consumer.connect()
      await this.consumer.subscribe({
        topics: [
          KAFKA_TOPICS.ORDER_PAID,
          KAFKA_TOPICS.INVOICE_CREATED,
          KAFKA_TOPICS.PAYMENT_RECEIVED,
          KAFKA_TOPICS.FINANCE_SYNC_REQUEST,
        ],
      })

      await this.consumer.run({
        eachMessage: async ({ topic, message }) => {
          try {
            const data = JSON.parse(message.value!.toString())
            await this.handleEvent(topic, data)
          } catch (error) {
            logger.error('Failed to process finance gateway message:', error)
          }
        },
      })

      this.isRunning = true
      logger.info('Finance Gateway Service started successfully')

      // Start scheduled reconciliation job
      this.startReconciliationJob()
    } catch (error) {
      logger.error('Failed to start Finance Gateway Service:', error)
      throw error
    }
  }

  /**
   * Stops the finance gateway service.
   * @returns {Promise<void>}
   */
  async stop(): Promise<void> {
    try {
      this.isRunning = false
      
      await this.consumer.disconnect()
      
      for (const [name, adapter] of this.adapters) {
        await adapter.disconnect()
        logger.info(`Disconnected from ${name}`)
      }

      logger.info('Finance Gateway Service stopped')
    } catch (error) {
      logger.error('Error stopping Finance Gateway Service:', error)
    }
  }

  /**
   * Handles incoming Kafka events for financial operations.
   * @private
   * @param {string} topic - The Kafka topic.
   * @param {any} data - The event payload.
   * @returns {Promise<void>}
   */
  private async handleEvent(topic: string, data: any): Promise<void> {
    try {
      switch (topic) {
        case KAFKA_TOPICS.ORDER_PAID:
          await this.handleOrderPaid(data)
          break

        case KAFKA_TOPICS.INVOICE_CREATED:
          await this.syncInvoiceToAllSystems(data.invoiceId)
          break

        case KAFKA_TOPICS.PAYMENT_RECEIVED:
          await this.recordPaymentInAllSystems(data)
          break

        case KAFKA_TOPICS.FINANCE_SYNC_REQUEST:
          await this.handleSyncRequest(data)
          break

        default:
          logger.warn(`Unknown topic: ${topic}`)
      }
    } catch (error) {
      logger.error(`Failed to handle event for topic ${topic}:`, error)
    }
  }

  /**
   * Handles the `ORDER_PAID` event by creating an invoice and publishing an `INVOICE_CREATED` event.
   * @private
   * @param {any} data - The event payload containing the order ID.
   * @returns {Promise<void>}
   */
  private async handleOrderPaid(data: any): Promise<void> {
    try {
      // Create invoice for paid order
      const order = await prisma.order.findUnique({
        where: { id: data.orderId },
        include: {
          customer: true,
          items: {
            include: {
              part: true,
            },
          },
        },
      })

      if (!order) {
        throw new Error(`Order not found: ${data.orderId}`)
      }

      // Create invoice record
      const invoice = await prisma.invoice.create({
        data: {
          invoiceNumber: `INV-${Date.now()}`,
          customerId: order.customerId,
          orderId: order.id,
          subtotal: order.subtotal,
          tax: order.tax,
          total: order.total,
          status: 'PAID',
          paidAt: new Date(),
        },
      })

      // Publish invoice created event
      await publishEvent(
        KAFKA_TOPICS.INVOICE_CREATED,
        invoice.id,
        {
          invoiceId: invoice.id,
          orderId: order.id,
          customerId: order.customerId,
          total: order.total,
          status: 'PAID',
        }
      )

      logger.info(`Created invoice ${invoice.id} for paid order ${data.orderId}`)
    } catch (error) {
      logger.error('Failed to handle order paid event:', error)
    }
  }

  /**
   * Synchronizes a single invoice to all configured financial systems.
   * @private
   * @param {string} invoiceId - The ID of the invoice to sync.
   * @returns {Promise<void>}
   */
  private async syncInvoiceToAllSystems(invoiceId: string): Promise<void> {
    for (const [name, adapter] of this.adapters) {
      try {
        await adapter.syncInvoice(invoiceId)
        logger.info(`Synced invoice ${invoiceId} to ${name}`)
      } catch (error) {
        logger.error(`Failed to sync invoice ${invoiceId} to ${name}:`, error)
      }
    }
  }

  /**
   * Records a payment in all configured financial systems.
   * @private
   * @param {any} data - The payment data.
   * @returns {Promise<void>}
   */
  private async recordPaymentInAllSystems(data: any): Promise<void> {
    const payment: CanonicalPayment = {
      platformPaymentId: data.paymentId,
      invoiceId: data.invoiceId,
      amount: data.amount,
      currency: data.currency || 'USD',
      paymentMethod: data.paymentMethod,
      paymentDate: new Date(data.paymentDate),
      reference: data.reference,
      gatewayTransactionId: data.gatewayTransactionId,
    }

    for (const [name, adapter] of this.adapters) {
      try {
        await adapter.recordPayment(payment)
        logger.info(`Recorded payment in ${name}`)
      } catch (error) {
        logger.error(`Failed to record payment in ${name}:`, error)
      }
    }
  }

  /**
   * Handles a direct synchronization request for a specific financial system.
   * @private
   * @param {any} data - The sync request payload.
   * @returns {Promise<void>}
   */
  private async handleSyncRequest(data: any): Promise<void> {
    const adapter = this.adapters.get(data.targetSystem)
    if (!adapter) {
      logger.error(`Unknown finance system: ${data.targetSystem}`)
      return
    }

    try {
      switch (data.operation) {
        case 'sync_invoice':
          await adapter.syncInvoice(data.invoiceId)
          break
        case 'record_payment':
          await adapter.recordPayment(data.payment)
          break
        default:
          logger.warn(`Unknown operation: ${data.operation}`)
      }
    } catch (error) {
      logger.error('Failed to handle sync request:', error)
    }
  }

  /**
   * Starts a recurring job to perform financial reconciliation.
   * @private
   */
  private startReconciliationJob(): void {
    // Run reconciliation every hour
    setInterval(async () => {
      if (!this.isRunning) return

      try {
        await this.performReconciliation()
      } catch (error) {
        logger.error('Reconciliation job failed:', error)
      }
    }, 60 * 60 * 1000) // 1 hour
  }

  /**
   * Performs the financial reconciliation process by fetching transactions from all adapters.
   * @private
   * @returns {Promise<void>}
   */
  private async performReconciliation(): Promise<void> {
    const endDate = new Date()
    const startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000) // 24 hours ago

    logger.info('Starting financial reconciliation process')

    for (const [name, adapter] of this.adapters) {
      try {
        const transactions = await adapter.getReconciledTransactions(startDate, endDate)
        
        // Process and match transactions with platform records
        for (const transaction of transactions) {
          await this.matchTransaction(transaction, name)
        }

        logger.info(`Processed ${transactions.length} transactions from ${name}`)
      } catch (error) {
        logger.error(`Reconciliation failed for ${name}:`, error)
      }
    }
  }

  /**
   * Matches a single reconciled transaction with a platform record.
   * @private
   * @param {any} transaction - The transaction data from the financial system.
   * @param {string} source - The name of the financial system.
   * @returns {Promise<void>}
   */
  private async matchTransaction(transaction: any, source: string): Promise<void> {
    try {
      // Extract reference from transaction
      const reference = transaction.reference
      if (!reference || !reference.startsWith('KC-')) {
        return // Skip non-KC transactions
      }

      // Find matching order or invoice
      const orderId = reference.replace('KC-ORD-', '').replace('KC-INV-', '')
      
      // Update reconciliation status
      logger.info(`Matched transaction ${transaction.id} with order/invoice ${orderId}`)
    } catch (error) {
      logger.error('Failed to match transaction:', error)
    }
  }

  /**
   * Manually triggers an invoice synchronization.
   * @param {string} invoiceId - The ID of the invoice to sync.
   * @param {string} [targetSystem] - The specific financial system to sync with. If omitted, syncs to all.
   * @returns {Promise<void>}
   */
  async manualSync(invoiceId: string, targetSystem?: string): Promise<void> {
    if (targetSystem) {
      const adapter = this.adapters.get(targetSystem)
      if (adapter) {
        await adapter.syncInvoice(invoiceId)
      }
    } else {
      await this.syncInvoiceToAllSystems(invoiceId)
    }
  }

  /**
   * Generates a reconciliation report for a given time period.
   * @param {Date} startDate - The start date for the report.
   * @param {Date} endDate - The end date for the report.
   * @returns {Promise<any>} A report object with reconciliation data.
   */
  async getReconciliationReport(startDate: Date, endDate: Date): Promise<any> {
    const report = {
      period: { startDate, endDate },
      systems: {},
      summary: {
        totalTransactions: 0,
        totalAmount: 0,
        matchedTransactions: 0,
        unmatchedTransactions: 0,
      },
    }

    for (const [name, adapter] of this.adapters) {
      try {
        const transactions = await adapter.getReconciledTransactions(startDate, endDate)
        report.systems[name] = {
          transactionCount: transactions.length,
          totalAmount: transactions.reduce((sum, t) => sum + (t.amount || 0), 0),
        }
        report.summary.totalTransactions += transactions.length
      } catch (error) {
        logger.error(`Failed to get reconciliation data from ${name}:`, error)
        report.systems[name] = { error: error.message }
      }
    }

    return report
  }
}

// Export singleton instance
export const financeGatewayService = new FinanceGatewayService()

// Export types
export type { CanonicalInvoice, CanonicalPayment }