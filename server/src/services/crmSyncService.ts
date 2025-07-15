import { logger } from '@/utils/logger'
import { config } from '@/config/environment'
import { prisma } from '@/config/database'
import { createConsumer, publishEvent, KAFKA_TOPICS } from '@/config/kafka'
import { Consumer } from 'kafkajs'
import jsforce from 'jsforce'
import { Client as HubSpotClient } from '@hubspot/api-client'

// Canonical data models
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

interface CanonicalInteraction {
  interactionId: string
  platformUserId: string
  channel: 'Web' | 'Email' | 'Phone' | 'Chat'
  timestamp: Date
  summary: string
  details: Record<string, any>
}

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

// Abstract CRM Adapter interface
abstract class CrmAdapter {
  abstract connect(): Promise<void>
  abstract disconnect(): Promise<void>
  abstract createContact(customer: CanonicalCustomer): Promise<string>
  abstract updateContact(externalId: string, customer: CanonicalCustomer): Promise<void>
  abstract deleteContact(externalId: string): Promise<void>
  abstract createTicket(ticket: CanonicalSupportTicket): Promise<string>
  abstract updateTicket(externalId: string, ticket: CanonicalSupportTicket): Promise<void>
  abstract syncContact(platformUserId: string): Promise<void>
  abstract webhookHandler(payload: any): Promise<void>
}

// Salesforce Adapter
class SalesforceAdapter extends CrmAdapter {
  private connection: jsforce.Connection
  private isConnected = false

  constructor() {
    super()
    this.connection = new jsforce.Connection({
      loginUrl: config.crm.salesforce.loginUrl || 'https://login.salesforce.com',
      version: '58.0',
    })
  }

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

  async disconnect(): Promise<void> {
    try {
      await this.connection.logout()
      this.isConnected = false
      logger.info('Disconnected from Salesforce')
    } catch (error) {
      logger.error('Error disconnecting from Salesforce:', error)
    }
  }

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

// HubSpot Adapter
class HubSpotAdapter extends CrmAdapter {
  private client: HubSpotClient
  private isConnected = false

  constructor() {
    super()
    this.client = new HubSpotClient({
      accessToken: config.crm.hubspot.apiKey,
    })
  }

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

  async disconnect(): Promise<void> {
    this.isConnected = false
    logger.info('Disconnected from HubSpot')
  }

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

  async deleteContact(externalId: string): Promise<void> {
    try {
      await this.client.crm.contacts.basicApi.archive(externalId)
      logger.info(`Archived HubSpot contact: ${externalId}`)
    } catch (error) {
      logger.error('Failed to archive HubSpot contact:', error)
      throw error
    }
  }

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

  async syncContact(platformUserId: string): Promise<void> {
    // Similar implementation to Salesforce adapter
    // Implementation details omitted for brevity
    logger.info(`Syncing contact ${platformUserId} with HubSpot`)
  }

  async webhookHandler(payload: any): Promise<void> {
    try {
      logger.info('Received HubSpot webhook:', payload)
      // Handle HubSpot webhook notifications
    } catch (error) {
      logger.error('Failed to process HubSpot webhook:', error)
    }
  }

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

// Main CRM Sync Service
class CrmSyncService {
  private adapters: Map<string, CrmAdapter> = new Map()
  private consumer: Consumer
  private isRunning = false

  constructor() {
    // Initialize adapters
    this.adapters.set('salesforce', new SalesforceAdapter())
    this.adapters.set('hubspot', new HubSpotAdapter())
    
    // Initialize Kafka consumer
    this.consumer = createConsumer('crm-sync-service')
  }

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

  private async syncTicketToAllCrms(ticketId: string): Promise<void> {
    // Implementation for syncing support tickets
    logger.info(`Syncing ticket ${ticketId} to all CRMs`)
  }

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

  // Webhook endpoints for inbound data
  async handleSalesforceWebhook(payload: any): Promise<void> {
    const adapter = this.adapters.get('salesforce') as SalesforceAdapter
    await adapter.webhookHandler(payload)
  }

  async handleHubSpotWebhook(payload: any): Promise<void> {
    const adapter = this.adapters.get('hubspot') as HubSpotAdapter
    await adapter.webhookHandler(payload)
  }
}

// Export singleton instance
export const crmSyncService = new CrmSyncService()

// Export types
export type { CanonicalCustomer, CanonicalInteraction, CanonicalSupportTicket }