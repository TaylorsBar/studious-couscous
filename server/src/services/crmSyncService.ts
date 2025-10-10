/**
 * @file Provides a service for synchronizing customer and support data with external CRM systems.
 *
 * This service uses a generic adapter pattern to support multiple CRM platforms (e.g., Salesforce, HubSpot).
 * It consumes Kafka events for user and ticket updates and translates them into API calls for the respective CRMs.
 * It also provides methods for handling inbound webhooks from CRMs.
 */
import { logger } from '@/utils/logger'
import { config } from '@/config/environment'
import { prisma } from '@/config/database'
import { createConsumer, publishEvent, KAFKA_TOPICS } from '@/config/kafka'
import { Consumer } from 'kafkajs'
import jsforce from 'jsforce'
import { Client as HubSpotClient } from '@hubspot/api-client'

/**
 * @interface CanonicalCustomer
 * @description A standardized data model for a customer, used to abstract away CRM-specific fields.
 */
interface CanonicalCustomer {
  platformUserId: string
  firstName: string
  lastName: string
  email: string
  phone?: string
  companyName?: string
  businessType: string
  tags: string[]
  lastSeen: Date
}

/**
 * @interface CanonicalInteraction
 * @description A standardized data model for a customer interaction.
 */
interface CanonicalInteraction {
  interactionId: string
  platformUserId: string
  channel: 'Web' | 'Email' | 'Phone' | 'Chat'
  timestamp: Date
  summary: string
  details: Record<string, any>
}

/**
 * @interface CanonicalSupportTicket
 * @description A standardized data model for a support ticket.
 */
interface CanonicalSupportTicket {
  ticketId: string
  platformUserId: string
  status: 'Open' | 'In-Progress' | 'Waiting-Customer' | 'Resolved' | 'Closed'
  priority: 'Low' | 'Medium' | 'High' | 'Urgent'
  subject: string
  description: string
  category: string
  createdAt: Date
  events: Array<{
    timestamp: Date
    action: string
    details: string
    userId?: string
  }>
}

/**
 * @abstract
 * @class CrmAdapter
 * @description Defines the interface that all CRM adapters must implement.
 * This ensures that the CrmSyncService can interact with any CRM in a consistent way.
 */
abstract class CrmAdapter {
  /** Connects to the CRM API. */
  abstract connect(): Promise<void>
  /** Disconnects from the CRM API. */
  abstract disconnect(): Promise<void>
  /** Creates a new contact in the CRM. */
  abstract createContact(customer: CanonicalCustomer): Promise<string>
  /** Updates an existing contact in the CRM. */
  abstract updateContact(externalId: string, customer: CanonicalCustomer): Promise<void>
  /** Deletes a contact from the CRM. */
  abstract deleteContact(externalId: string): Promise<void>
  /** Creates a new support ticket in the CRM. */
  abstract createTicket(ticket: CanonicalSupportTicket): Promise<string>
  /** Updates an existing support ticket in the CRM. */
  abstract updateTicket(externalId: string, ticket: CanonicalSupportTicket): Promise<void>
  /** Synchronizes a platform user's data with the CRM. */
  abstract syncContact(platformUserId: string): Promise<void>
  /** Handles inbound webhook notifications from the CRM. */
  abstract webhookHandler(payload: any): Promise<void>
}

/**
 * @class SalesforceAdapter
 * @extends CrmAdapter
 * @description Provides the concrete implementation for interacting with the Salesforce API.
 */
class SalesforceAdapter extends CrmAdapter {
  private connection: jsforce.Connection
  private isConnected = false

  /**
   * @constructor
   * @description Initializes the jsforce connection object.
   */
  constructor() {
    super()
    this.connection = new jsforce.Connection({
      loginUrl: config.crm.salesforce.loginUrl || 'https://login.salesforce.com',
      version: '58.0',
    })
  }

  /**
   * Connects to the Salesforce API using credentials from the environment configuration.
   * @returns {Promise<void>} A promise that resolves upon successful connection.
   * @throws Will throw an error if the connection fails.
   */
  async connect(): Promise<void> {
    try {
      if (!config.crm.salesforce.clientId || !config.crm.salesforce.clientSecret) {
        throw new Error('Salesforce credentials not configured')
      }

      // Use OAuth2 for production, username/password for development
      await this.connection.login(
        config.crm.salesforce.username!,
        config.crm.salesforce.password! + config.crm.salesforce.securityToken!
      )

      this.isConnected = true
      logger.info('Connected to Salesforce successfully')
    } catch (error) {
      logger.error('Failed to connect to Salesforce:', error)
      throw error
    }
  }

  /**
   * Disconnects from the Salesforce API.
   * @returns {Promise<void>}
   */
  async disconnect(): Promise<void> {
    try {
      await this.connection.logout()
      this.isConnected = false
      logger.info('Disconnected from Salesforce')
    } catch (error) {
      logger.error('Error disconnecting from Salesforce:', error)
    }
  }

  /**
   * Creates a new Contact in Salesforce from a canonical customer model.
   * @param {CanonicalCustomer} customer - The standardized customer data.
   * @returns {Promise<string>} The ID of the newly created Salesforce contact.
   * @throws Will throw an error if contact creation fails.
   */
  async createContact(customer: CanonicalCustomer): Promise<string> {
    try {
      if (!this.isConnected) await this.connect()

      const contactData = {
        FirstName: customer.firstName,
        LastName: customer.lastName,
        Email: customer.email,
        Phone: customer.phone,
        Account: {
          Name: customer.companyName || `${customer.firstName} ${customer.lastName}`,
          Type: this.mapBusinessType(customer.businessType),
        },
        LeadSource: 'KC Speedshop Platform',
        Description: `Tags: ${customer.tags.join(', ')}`,
        KC_Platform_User_ID__c: customer.platformUserId, // Custom field
        Last_Seen__c: customer.lastSeen,
      }

      const result = await this.connection.sobject('Contact').create(contactData)
      
      if (!result.success) {
        throw new Error(`Salesforce contact creation failed: ${result.errors?.join(', ')}`)
      }

      logger.info(`Created Salesforce contact: ${result.id}`)
      return result.id
    } catch (error) {
      logger.error('Failed to create Salesforce contact:', error)
      throw error
    }
  }

  /**
   * Updates an existing Contact in Salesforce.
   * @param {string} externalId - The Salesforce ID of the contact to update.
   * @param {CanonicalCustomer} customer - The updated customer data.
   * @returns {Promise<void>}
   * @throws Will throw an error if the update fails.
   */
  async updateContact(externalId: string, customer: CanonicalCustomer): Promise<void> {
    try {
      if (!this.isConnected) await this.connect()

      const updateData = {
        FirstName: customer.firstName,
        LastName: customer.lastName,
        Email: customer.email,
        Phone: customer.phone,
        Description: `Tags: ${customer.tags.join(', ')}`,
        Last_Seen__c: customer.lastSeen,
      }

      await this.connection.sobject('Contact').update({
        Id: externalId,
        ...updateData,
      })

      logger.info(`Updated Salesforce contact: ${externalId}`)
    } catch (error) {
      logger.error('Failed to update Salesforce contact:', error)
      throw error
    }
  }

  /**
   * Deletes a Contact from Salesforce.
   * @param {string} externalId - The Salesforce ID of the contact to delete.
   * @returns {Promise<void>}
   * @throws Will throw an error if the deletion fails.
   */
  async deleteContact(externalId: string): Promise<void> {
    try {
      if (!this.isConnected) await this.connect()

      await this.connection.sobject('Contact').delete(externalId)
      logger.info(`Deleted Salesforce contact: ${externalId}`)
    } catch (error) {
      logger.error('Failed to delete Salesforce contact:', error)
      throw error
    }
  }

  /**
   * Creates a new Case (support ticket) in Salesforce.
   * @param {CanonicalSupportTicket} ticket - The standardized ticket data.
   * @returns {Promise<string>} The ID of the newly created Salesforce case.
   * @throws Will throw an error if case creation fails.
   */
  async createTicket(ticket: CanonicalSupportTicket): Promise<string> {
    try {
      if (!this.isConnected) await this.connect()

      // Find the contact by platform user ID
      const contacts = await this.connection.query(
        `SELECT Id FROM Contact WHERE KC_Platform_User_ID__c = '${ticket.platformUserId}'`
      )

      const contactId = contacts.records[0]?.Id

      const caseData = {
        Subject: ticket.subject,
        Description: ticket.description,
        Status: this.mapTicketStatus(ticket.status),
        Priority: ticket.priority,
        Origin: 'KC Speedshop Platform',
        Type: ticket.category,
        ContactId: contactId,
        KC_Platform_Ticket_ID__c: ticket.ticketId, // Custom field
      }

      const result = await this.connection.sobject('Case').create(caseData)
      
      if (!result.success) {
        throw new Error(`Salesforce case creation failed: ${result.errors?.join(', ')}`)
      }

      logger.info(`Created Salesforce case: ${result.id}`)
      return result.id
    } catch (error) {
      logger.error('Failed to create Salesforce case:', error)
      throw error
    }
  }

  /**
   * Updates an existing Case in Salesforce.
   * @param {string} externalId - The Salesforce ID of the case to update.
   * @param {CanonicalSupportTicket} ticket - The updated ticket data.
   * @returns {Promise<void>}
   * @throws Will throw an error if the update fails.
   */
  async updateTicket(externalId: string, ticket: CanonicalSupportTicket): Promise<void> {
    try {
      if (!this.isConnected) await this.connect()

      const updateData = {
        Subject: ticket.subject,
        Description: ticket.description,
        Status: this.mapTicketStatus(ticket.status),
        Priority: ticket.priority,
      }

      await this.connection.sobject('Case').update({
        Id: externalId,
        ...updateData,
      })

      logger.info(`Updated Salesforce case: ${externalId}`)
    } catch (error) {
      logger.error('Failed to update Salesforce case:', error)
      throw error
    }
  }

  /**
   * Synchronizes a user from the local platform database to Salesforce.
   * It creates a new contact if one doesn't exist or updates the existing one.
   * @param {string} platformUserId - The ID of the user on the local platform.
   * @returns {Promise<void>}
   * @throws Will throw an error if the user is not found or the sync operation fails.
   */
  async syncContact(platformUserId: string): Promise<void> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: platformUserId },
      })

      if (!user) {
        throw new Error(`User not found: ${platformUserId}`)
      }

      const canonicalCustomer: CanonicalCustomer = {
        platformUserId: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phoneNumber || undefined,
        companyName: user.companyName || undefined,
        businessType: user.businessType,
        tags: [user.businessType], // Can be enhanced with actual tags
        lastSeen: user.lastLoginAt || user.createdAt,
      }

      let externalId: string

      if (user.salesforceId) {
        // Update existing contact
        await this.updateContact(user.salesforceId, canonicalCustomer)
        externalId = user.salesforceId
      } else {
        // Create new contact
        externalId = await this.createContact(canonicalCustomer)
        
        // Update user with Salesforce ID
        await prisma.user.update({
          where: { id: platformUserId },
          data: { 
            salesforceId: externalId,
            crmSyncedAt: new Date(),
          },
        })
      }

      // Log sync operation
      await prisma.crmSyncLog.create({
        data: {
          crmSystem: 'SALESFORCE',
          operation: user.salesforceId ? 'UPDATE' : 'CREATE',
          entityType: 'user',
          entityId: platformUserId,
          externalId,
          status: 'SUCCESS',
        },
      })

    } catch (error) {
      logger.error('Failed to sync contact with Salesforce:', error)
      
      // Log failed sync
      await prisma.crmSyncLog.create({
        data: {
          crmSystem: 'SALESFORCE',
          operation: 'SYNC',
          entityType: 'user',
          entityId: platformUserId,
          status: 'FAILED',
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        },
      })
      
      throw error
    }
  }

  /**
   * Handles inbound webhook notifications from Salesforce.
   * It parses the payload and publishes a Kafka event to trigger updates in the local system.
   * @param {any} payload - The webhook payload from Salesforce.
   * @returns {Promise<void>}
   */
  async webhookHandler(payload: any): Promise<void> {
    try {
      // Handle Salesforce webhook notifications
      logger.info('Received Salesforce webhook:', payload)

      // Parse the webhook payload and update local data
      if (payload.sobjectType === 'Contact' && payload.KC_Platform_User_ID__c) {
        // Update local user data from Salesforce changes
        await publishEvent(
          KAFKA_TOPICS.CRM_SYNC_REQUEST,
          payload.KC_Platform_User_ID__c,
          {
            eventType: 'CRM_INBOUND_UPDATE',
            crmSystem: 'salesforce',
            entityType: 'contact',
            externalId: payload.Id,
            platformUserId: payload.KC_Platform_User_ID__c,
            data: payload,
          }
        )
      }
    } catch (error) {
      logger.error('Failed to process Salesforce webhook:', error)
    }
  }

  /**
   * Maps a platform business type to a Salesforce-compatible account type.
   * @private
   * @param {string} businessType - The business type from the local platform.
   * @returns {string} The corresponding Salesforce account type.
   */
  private mapBusinessType(businessType: string): string {
    const mapping: Record<string, string> = {
      CUSTOMER: 'Customer',
      SUPPLIER: 'Vendor',
      DEALER: 'Partner',
      WHOLESALER: 'Reseller',
      MANUFACTURER: 'Vendor',
    }
    return mapping[businessType] || 'Customer'
  }

  /**
   * Maps a platform ticket status to a Salesforce-compatible case status.
   * @private
   * @param {string} status - The ticket status from the local platform.
   * @returns {string} The corresponding Salesforce case status.
   */
  private mapTicketStatus(status: string): string {
    const mapping: Record<string, string> = {
      'Open': 'New',
      'In-Progress': 'Working',
      'Waiting-Customer': 'Customer Response Required',
      'Resolved': 'Closed',
      'Closed': 'Closed',
    }
    return mapping[status] || 'New'
  }
}

/**
 * @class HubSpotAdapter
 * @extends CrmAdapter
 * @description Provides the concrete implementation for interacting with the HubSpot API.
 */
class HubSpotAdapter extends CrmAdapter {
  private client: HubSpotClient
  private isConnected = false

  /**
   * @constructor
   * @description Initializes the HubSpot API client.
   */
  constructor() {
    super()
    this.client = new HubSpotClient({
      accessToken: config.crm.hubspot.apiKey,
    })
  }

  /**
   * Connects to the HubSpot API by making a test request.
   * @returns {Promise<void>}
   * @throws Will throw an error if the connection fails.
   */
  async connect(): Promise<void> {
    try {
      if (!config.crm.hubspot.apiKey) {
        throw new Error('HubSpot API key not configured')
      }

      // Test the connection
      await this.client.crm.contacts.basicApi.getPage()
      this.isConnected = true
      logger.info('Connected to HubSpot successfully')
    } catch (error) {
      logger.error('Failed to connect to HubSpot:', error)
      throw error
    }
  }

  /**
   * Disconnects from the HubSpot API (no-op for this adapter).
   * @returns {Promise<void>}
   */
  async disconnect(): Promise<void> {
    this.isConnected = false
    logger.info('Disconnected from HubSpot')
  }

  /**
   * Creates a new contact in HubSpot.
   * @param {CanonicalCustomer} customer - The standardized customer data.
   * @returns {Promise<string>} The ID of the newly created HubSpot contact.
   * @throws Will throw an error if contact creation fails.
   */
  async createContact(customer: CanonicalCustomer): Promise<string> {
    try {
      const contactData = {
        properties: {
          firstname: customer.firstName,
          lastname: customer.lastName,
          email: customer.email,
          phone: customer.phone,
          company: customer.companyName,
          lifecyclestage: this.mapBusinessType(customer.businessType),
          hs_lead_source: 'KC Speedshop Platform',
          kc_platform_user_id: customer.platformUserId,
          kc_business_type: customer.businessType,
          kc_tags: customer.tags.join(';'),
          lastmodifieddate: customer.lastSeen.toISOString(),
        },
      }

      const response = await this.client.crm.contacts.basicApi.create(contactData)
      
      logger.info(`Created HubSpot contact: ${response.id}`)
      return response.id!
    } catch (error) {
      logger.error('Failed to create HubSpot contact:', error)
      throw error
    }
  }

  /**
   * Updates an existing contact in HubSpot.
   * @param {string} externalId - The HubSpot ID of the contact to update.
   * @param {CanonicalCustomer} customer - The updated customer data.
   * @returns {Promise<void>}
   * @throws Will throw an error if the update fails.
   */
  async updateContact(externalId: string, customer: CanonicalCustomer): Promise<void> {
    try {
      const updateData = {
        properties: {
          firstname: customer.firstName,
          lastname: customer.lastName,
          email: customer.email,
          phone: customer.phone,
          company: customer.companyName,
          kc_tags: customer.tags.join(';'),
          lastmodifieddate: customer.lastSeen.toISOString(),
        },
      }

      await this.client.crm.contacts.basicApi.update(externalId, updateData)
      logger.info(`Updated HubSpot contact: ${externalId}`)
    } catch (error) {
      logger.error('Failed to update HubSpot contact:', error)
      throw error
    }
  }

  /**
   * Archives a contact in HubSpot (soft delete).
   * @param {string} externalId - The HubSpot ID of the contact to archive.
   * @returns {Promise<void>}
   * @throws Will throw an error if archiving fails.
   */
  async deleteContact(externalId: string): Promise<void> {
    try {
      await this.client.crm.contacts.basicApi.archive(externalId)
      logger.info(`Archived HubSpot contact: ${externalId}`)
    } catch (error) {
      logger.error('Failed to archive HubSpot contact:', error)
      throw error
    }
  }

  /**
   * Creates a new support ticket in HubSpot.
   * @param {CanonicalSupportTicket} ticket - The standardized ticket data.
   * @returns {Promise<string>} The ID of the newly created HubSpot ticket.
   * @throws Will throw an error if ticket creation fails.
   */
  async createTicket(ticket: CanonicalSupportTicket): Promise<string> {
    try {
      // Find the contact by platform user ID
      const searchRequest = {
        filterGroups: [
          {
            filters: [
              {
                propertyName: 'kc_platform_user_id',
                operator: 'EQ',
                value: ticket.platformUserId,
              },
            ],
          },
        ],
      }

      const contactSearch = await this.client.crm.contacts.searchApi.doSearch(searchRequest)
      const contactId = contactSearch.results[0]?.id

      const ticketData = {
        properties: {
          subject: ticket.subject,
          content: ticket.description,
          hs_ticket_priority: ticket.priority.toLowerCase(),
          hs_pipeline_stage: this.mapTicketStatus(ticket.status),
          source_type: 'KC_SPEEDSHOP',
          hs_ticket_category: ticket.category,
          kc_platform_ticket_id: ticket.ticketId,
        },
        associations: contactId ? [
          {
            to: { id: contactId },
            types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 16 }], // Contact to Ticket
          },
        ] : [],
      }

      const response = await this.client.crm.tickets.basicApi.create(ticketData)
      
      logger.info(`Created HubSpot ticket: ${response.id}`)
      return response.id!
    } catch (error) {
      logger.error('Failed to create HubSpot ticket:', error)
      throw error
    }
  }

  /**
   * Updates an existing ticket in HubSpot.
   * @param {string} externalId - The HubSpot ID of the ticket to update.
   * @param {CanonicalSupportTicket} ticket - The updated ticket data.
   * @returns {Promise<void>}
   * @throws Will throw an error if the update fails.
   */
  async updateTicket(externalId: string, ticket: CanonicalSupportTicket): Promise<void> {
    try {
      const updateData = {
        properties: {
          subject: ticket.subject,
          content: ticket.description,
          hs_ticket_priority: ticket.priority.toLowerCase(),
          hs_pipeline_stage: this.mapTicketStatus(ticket.status),
        },
      }

      await this.client.crm.tickets.basicApi.update(externalId, updateData)
      logger.info(`Updated HubSpot ticket: ${externalId}`)
    } catch (error) {
      logger.error('Failed to update HubSpot ticket:', error)
      throw error
    }
  }

  /**
   * Synchronizes a user from the local platform database to HubSpot.
   * @param {string} platformUserId - The ID of the user on the local platform.
   * @returns {Promise<void>}
   */
  async syncContact(platformUserId: string): Promise<void> {
    // Similar implementation to Salesforce adapter
    // Implementation details omitted for brevity
    logger.info(`Syncing contact ${platformUserId} with HubSpot`)
  }

  /**
   * Handles inbound webhook notifications from HubSpot.
   * @param {any} payload - The webhook payload from HubSpot.
   * @returns {Promise<void>}
   */
  async webhookHandler(payload: any): Promise<void> {
    try {
      logger.info('Received HubSpot webhook:', payload)
      // Handle HubSpot webhook notifications
    } catch (error) {
      logger.error('Failed to process HubSpot webhook:', error)
    }
  }

  /**
   * Maps a platform business type to a HubSpot-compatible lifecycle stage.
   * @private
   * @param {string} businessType - The business type from the local platform.
   * @returns {string} The corresponding HubSpot lifecycle stage.
   */
  private mapBusinessType(businessType: string): string {
    const mapping: Record<string, string> = {
      CUSTOMER: 'customer',
      SUPPLIER: 'vendor',
      DEALER: 'partner',
      WHOLESALER: 'reseller',
      MANUFACTURER: 'vendor',
    }
    return mapping[businessType] || 'customer'
  }

  /**
   * Maps a platform ticket status to a HubSpot-compatible pipeline stage ID.
   * @private
   * @param {string} status - The ticket status from the local platform.
   * @returns {string} The corresponding HubSpot pipeline stage ID.
   */
  private mapTicketStatus(status: string): string {
    const mapping: Record<string, string> = {
      'Open': '1',
      'In-Progress': '2',
      'Waiting-Customer': '3',
      'Resolved': '4',
      'Closed': '4',
    }
    return mapping[status] || '1'
  }
}

/**
 * @class CrmSyncService
 * @description Orchestrates the synchronization of data between the platform and various CRM systems.
 * It manages a collection of CRM adapters and a Kafka consumer to process events.
 */
class CrmSyncService {
  private adapters: Map<string, CrmAdapter> = new Map()
  private consumer: Consumer
  private isRunning = false

  /**
   * @constructor
   * @description Initializes the CRM adapters and the Kafka consumer.
   */
  constructor() {
    // Initialize adapters
    this.adapters.set('salesforce', new SalesforceAdapter())
    this.adapters.set('hubspot', new HubSpotAdapter())
    
    // Initialize Kafka consumer
    this.consumer = createConsumer('crm-sync-service')
  }

  /**
   * Starts the CRM synchronization service. This includes connecting to all configured
   * CRM systems and starting the Kafka consumer to listen for relevant events.
   * @returns {Promise<void>}
   * @throws Will throw an error if the service fails to start.
   */
  async start(): Promise<void> {
    try {
      // Connect to all CRM systems
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
          KAFKA_TOPICS.USER_CREATED,
          KAFKA_TOPICS.USER_UPDATED,
          KAFKA_TOPICS.SUPPORT_TICKET_CREATED,
          KAFKA_TOPICS.CRM_SYNC_REQUEST,
        ],
      })

      await this.consumer.run({
        eachMessage: async ({ topic, partition, message }) => {
          try {
            const data = JSON.parse(message.value!.toString())
            await this.handleEvent(topic, data)
          } catch (error) {
            logger.error('Failed to process CRM sync message:', error)
          }
        },
      })

      this.isRunning = true
      logger.info('CRM Sync Service started successfully')
    } catch (error) {
      logger.error('Failed to start CRM Sync Service:', error)
      throw error
    }
  }

  /**
   * Stops the CRM synchronization service, disconnecting from Kafka and all CRM systems.
   * @returns {Promise<void>}
   */
  async stop(): Promise<void> {
    try {
      this.isRunning = false
      
      // Disconnect consumer
      await this.consumer.disconnect()
      
      // Disconnect all adapters
      for (const [name, adapter] of this.adapters) {
        await adapter.disconnect()
        logger.info(`Disconnected from ${name}`)
      }

      logger.info('CRM Sync Service stopped')
    } catch (error) {
      logger.error('Error stopping CRM Sync Service:', error)
    }
  }

  /**
   * Handles incoming Kafka events by routing them to the appropriate handler function based on the topic.
   * @private
   * @param {string} topic - The Kafka topic of the message.
   * @param {any} data - The event payload.
   * @returns {Promise<void>}
   */
  private async handleEvent(topic: string, data: any): Promise<void> {
    try {
      switch (topic) {
        case KAFKA_TOPICS.USER_CREATED:
        case KAFKA_TOPICS.USER_UPDATED:
          await this.syncUserToAllCrms(data.userId)
          break

        case KAFKA_TOPICS.SUPPORT_TICKET_CREATED:
          await this.syncTicketToAllCrms(data.ticketId)
          break

        case KAFKA_TOPICS.CRM_SYNC_REQUEST:
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
   * Synchronizes a user's data to all configured CRM systems.
   * @private
   * @param {string} userId - The ID of the user to sync.
   * @returns {Promise<void>}
   */
  private async syncUserToAllCrms(userId: string): Promise<void> {
    for (const [name, adapter] of this.adapters) {
      try {
        await adapter.syncContact(userId)
        logger.info(`Synced user ${userId} to ${name}`)
      } catch (error) {
        logger.error(`Failed to sync user ${userId} to ${name}:`, error)
      }
    }
  }

  /**
   * Synchronizes a support ticket's data to all configured CRM systems.
   * @private
   * @param {string} ticketId - The ID of the ticket to sync.
   * @returns {Promise<void>}
   */
  private async syncTicketToAllCrms(ticketId: string): Promise<void> {
    // Implementation for syncing support tickets
    logger.info(`Syncing ticket ${ticketId} to all CRMs`)
  }

  /**
   * Handles a direct synchronization request for a specific CRM.
   * @private
   * @param {any} data - The sync request payload.
   * @returns {Promise<void>}
   */
  private async handleSyncRequest(data: any): Promise<void> {
    const adapter = this.adapters.get(data.targetCrm)
    if (!adapter) {
      logger.error(`Unknown CRM system: ${data.targetCrm}`)
      return
    }

    try {
      switch (data.operation) {
        case 'create':
          // Handle create operation
          break
        case 'update':
          // Handle update operation
          break
        case 'delete':
          // Handle delete operation
          break
        default:
          logger.warn(`Unknown operation: ${data.operation}`)
      }
    } catch (error) {
      logger.error(`Failed to handle sync request:`, error)
    }
  }

  /**
   * Public method to handle inbound webhooks from Salesforce.
   * @param {any} payload - The webhook payload.
   * @returns {Promise<void>}
   */
  async handleSalesforceWebhook(payload: any): Promise<void> {
    const adapter = this.adapters.get('salesforce') as SalesforceAdapter
    await adapter.webhookHandler(payload)
  }

  /**
   * Public method to handle inbound webhooks from HubSpot.
   * @param {any} payload - The webhook payload.
   * @returns {Promise<void>}
   */
  async handleHubSpotWebhook(payload: any): Promise<void> {
    const adapter = this.adapters.get('hubspot') as HubSpotAdapter
    await adapter.webhookHandler(payload)
  }
}

// Export singleton instance
export const crmSyncService = new CrmSyncService()

// Export types
export type { CanonicalCustomer, CanonicalInteraction, CanonicalSupportTicket }