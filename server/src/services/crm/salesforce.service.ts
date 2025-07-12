import jsforce from 'jsforce';
import { prisma } from '../../config/database';
import { logger } from '../../config/logger';
import { CrmSystem, CrmOperation, CrmSyncStatus } from '@prisma/client';

export interface SalesforceConfig {
  loginUrl: string;
  username: string;
  password: string;
  securityToken: string;
  clientId: string;
  clientSecret: string;
}

export interface SalesforceAccount {
  Id?: string;
  Name: string;
  Email__c?: string;
  Phone?: string;
  Type: string;
  Industry?: string;
  BillingAddress?: {
    street?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  };
  // KC Speedshop custom fields
  Business_Type__c?: string;
  Credit_Limit__c?: number;
  Payment_Terms__c?: string;
  Tax_ID__c?: string;
  Vehicle_Count__c?: number;
  Preferred_Parts_Category__c?: string;
  Last_Order_Date__c?: Date;
  Total_Order_Value__c?: number;
}

export interface SalesforceOpportunity {
  Id?: string;
  Name: string;
  AccountId: string;
  Amount: number;
  CloseDate: Date;
  StageName: string;
  // KC Speedshop custom fields
  Vehicle_Year__c?: number;
  Vehicle_Make__c?: string;
  Vehicle_Model__c?: string;
  Project_Type__c?: string;
  Parts_Required__c?: string;
  Labor_Hours__c?: number;
  Expected_Completion__c?: Date;
}

export interface SalesforceContact {
  Id?: string;
  AccountId: string;
  FirstName: string;
  LastName: string;
  Email: string;
  Phone?: string;
  Title?: string;
  // KC Speedshop custom fields
  Automotive_Experience__c?: string;
  Preferred_Contact_Method__c?: string;
  Vehicle_Interests__c?: string;
}

export class SalesforceService {
  private conn: jsforce.Connection;
  private isConnected = false;

  constructor(private config: SalesforceConfig) {
    this.conn = new jsforce.Connection({
      loginUrl: config.loginUrl,
      version: '58.0'
    });
  }

  /**
   * Authenticate with Salesforce
   */
  async authenticate(): Promise<void> {
    try {
      await this.conn.login(
        this.config.username,
        this.config.password + this.config.securityToken
      );
      this.isConnected = true;
      logger.info('Successfully authenticated with Salesforce');
    } catch (error) {
      logger.error('Failed to authenticate with Salesforce', error);
      throw error;
    }
  }

  /**
   * Sync user to Salesforce as Account and Contact
   */
  async syncUserToSalesforce(userId: string): Promise<string> {
    try {
      if (!this.isConnected) {
        await this.authenticate();
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          vehicles: true,
          orders: {
            include: { items: true }
          }
        }
      });

      if (!user) {
        throw new Error('User not found');
      }

      // Create or update Account
      const accountData: SalesforceAccount = {
        Name: user.companyName || `${user.firstName} ${user.lastName}`,
        Email__c: user.email,
        Phone: user.phoneNumber,
        Type: 'Customer',
        Industry: 'Automotive',
        Business_Type__c: user.businessType,
        Credit_Limit__c: user.creditLimit,
        Payment_Terms__c: user.paymentTerms,
        Tax_ID__c: user.taxId,
        Vehicle_Count__c: user.vehicles.length,
        Last_Order_Date__c: user.orders[0]?.createdAt,
        Total_Order_Value__c: user.orders.reduce((sum, order) => sum + order.total, 0)
      };

      let accountId: string;

      if (user.salesforceId) {
        // Update existing account
        await this.conn.sobject('Account').update({
          Id: user.salesforceId,
          ...accountData
        });
        accountId = user.salesforceId;
      } else {
        // Create new account
        const result = await this.conn.sobject('Account').create(accountData);
        if (!result.success) {
          throw new Error(`Failed to create Salesforce account: ${result.errors?.join(', ')}`);
        }
        accountId = result.id;

        // Update user with Salesforce ID
        await prisma.user.update({
          where: { id: userId },
          data: {
            salesforceId: accountId,
            crmSyncedAt: new Date()
          }
        });
      }

      // Create or update Contact
      const contactData: SalesforceContact = {
        AccountId: accountId,
        FirstName: user.firstName,
        LastName: user.lastName,
        Email: user.email,
        Phone: user.phoneNumber,
        Title: user.businessType === 'CUSTOMER' ? 'Customer' : 'Business Contact',
        Automotive_Experience__c: 'Enthusiast', // Could be derived from user data
        Preferred_Contact_Method__c: 'Email',
        Vehicle_Interests__c: user.vehicles.map(v => `${v.year} ${v.make} ${v.model}`).join(', ')
      };

      await this.conn.sobject('Contact').create(contactData);

      // Log sync operation
      await this.logSyncOperation(
        CrmOperation.CREATE,
        'user',
        userId,
        accountId,
        CrmSyncStatus.SUCCESS
      );

      logger.info('Successfully synced user to Salesforce', { userId, accountId });
      return accountId;
    } catch (error) {
      await this.logSyncOperation(
        CrmOperation.CREATE,
        'user',
        userId,
        null,
        CrmSyncStatus.FAILED,
        error.message
      );
      logger.error('Failed to sync user to Salesforce', { userId, error });
      throw error;
    }
  }

  /**
   * Sync order to Salesforce as Opportunity
   */
  async syncOrderToSalesforce(orderId: string): Promise<string> {
    try {
      if (!this.isConnected) {
        await this.authenticate();
      }

      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
          customer: true,
          items: {
            include: { part: true }
          }
        }
      });

      if (!order) {
        throw new Error('Order not found');
      }

      // Ensure customer is synced to Salesforce
      let accountId = order.customer.salesforceId;
      if (!accountId) {
        accountId = await this.syncUserToSalesforce(order.customer.id);
      }

      const opportunityData: SalesforceOpportunity = {
        Name: `Order ${order.orderNumber}`,
        AccountId: accountId,
        Amount: order.total,
        CloseDate: order.deliveredAt || new Date(),
        StageName: this.mapOrderStatusToSalesforceStage(order.status),
        Parts_Required__c: order.items.map(item => 
          `${item.part.name} (${item.quantity})`
        ).join(', '),
        Labor_Hours__c: order.items.reduce((sum, item) => 
          sum + (item.part.specifications?.laborHours || 0), 0
        )
      };

      const result = await this.conn.sobject('Opportunity').create(opportunityData);
      if (!result.success) {
        throw new Error(`Failed to create Salesforce opportunity: ${result.errors?.join(', ')}`);
      }

      // Log sync operation
      await this.logSyncOperation(
        CrmOperation.CREATE,
        'order',
        orderId,
        result.id,
        CrmSyncStatus.SUCCESS
      );

      logger.info('Successfully synced order to Salesforce', { orderId, opportunityId: result.id });
      return result.id;
    } catch (error) {
      await this.logSyncOperation(
        CrmOperation.CREATE,
        'order',
        orderId,
        null,
        CrmSyncStatus.FAILED,
        error.message
      );
      logger.error('Failed to sync order to Salesforce', { orderId, error });
      throw error;
    }
  }

  /**
   * Pull customer data from Salesforce
   */
  async pullCustomerFromSalesforce(salesforceId: string): Promise<any> {
    try {
      if (!this.isConnected) {
        await this.authenticate();
      }

      const account = await this.conn.sobject('Account').retrieve(salesforceId);
      const contacts = await this.conn.sobject('Contact').find({
        AccountId: salesforceId
      });

      return {
        account,
        contacts
      };
    } catch (error) {
      logger.error('Failed to pull customer from Salesforce', { salesforceId, error });
      throw error;
    }
  }

  /**
   * Sync Salesforce data to local database
   */
  async syncFromSalesforce(): Promise<void> {
    try {
      if (!this.isConnected) {
        await this.authenticate();
      }

      // Get recently modified accounts
      const accounts = await this.conn.sobject('Account').find({
        Type: 'Customer',
        LastModifiedDate: jsforce.Date.LAST_N_DAYS(7)
      });

      for (const account of accounts) {
        await this.syncAccountToDatabase(account);
      }

      // Get recently modified opportunities
      const opportunities = await this.conn.sobject('Opportunity').find({
        LastModifiedDate: jsforce.Date.LAST_N_DAYS(7)
      });

      for (const opportunity of opportunities) {
        await this.syncOpportunityToDatabase(opportunity);
      }

      logger.info('Successfully synced data from Salesforce', {
        accountsCount: accounts.length,
        opportunitiesCount: opportunities.length
      });
    } catch (error) {
      logger.error('Failed to sync from Salesforce', error);
      throw error;
    }
  }

  /**
   * Sync Salesforce account to local database
   */
  private async syncAccountToDatabase(account: any): Promise<void> {
    try {
      const existingUser = await prisma.user.findFirst({
        where: { salesforceId: account.Id }
      });

      if (existingUser) {
        // Update existing user
        await prisma.user.update({
          where: { id: existingUser.id },
          data: {
            companyName: account.Name,
            email: account.Email__c,
            phoneNumber: account.Phone,
            businessType: account.Business_Type__c,
            creditLimit: account.Credit_Limit__c,
            paymentTerms: account.Payment_Terms__c,
            taxId: account.Tax_ID__c,
            crmSyncedAt: new Date()
          }
        });
      } else {
        // Create new user (if email doesn't exist)
        const emailExists = await prisma.user.findUnique({
          where: { email: account.Email__c }
        });

        if (!emailExists && account.Email__c) {
          await prisma.user.create({
            data: {
              email: account.Email__c,
              username: account.Email__c.split('@')[0],
              firstName: account.Name.split(' ')[0] || 'Unknown',
              lastName: account.Name.split(' ').slice(1).join(' ') || 'User',
              password: 'temp_password_' + Math.random().toString(36),
              companyName: account.Name,
              phoneNumber: account.Phone,
              businessType: account.Business_Type__c || 'CUSTOMER',
              creditLimit: account.Credit_Limit__c,
              paymentTerms: account.Payment_Terms__c,
              taxId: account.Tax_ID__c,
              salesforceId: account.Id,
              crmSyncedAt: new Date()
            }
          });
        }
      }

      // Log sync operation
      await this.logSyncOperation(
        CrmOperation.SYNC,
        'account',
        account.Id,
        account.Id,
        CrmSyncStatus.SUCCESS
      );
    } catch (error) {
      await this.logSyncOperation(
        CrmOperation.SYNC,
        'account',
        account.Id,
        null,
        CrmSyncStatus.FAILED,
        error.message
      );
      logger.error('Failed to sync account to database', { accountId: account.Id, error });
    }
  }

  /**
   * Sync Salesforce opportunity to local database
   */
  private async syncOpportunityToDatabase(opportunity: any): Promise<void> {
    try {
      // Find the corresponding user
      const user = await prisma.user.findFirst({
        where: { salesforceId: opportunity.AccountId }
      });

      if (!user) {
        logger.warn('User not found for opportunity', { opportunityId: opportunity.Id });
        return;
      }

      // Check if this is a new opportunity that should create an order
      if (opportunity.StageName === 'Closed Won' && opportunity.Name.startsWith('Order ')) {
        const orderNumber = opportunity.Name.replace('Order ', '');
        const existingOrder = await prisma.order.findFirst({
          where: { orderNumber }
        });

        if (!existingOrder) {
          // Create new order from opportunity
          await prisma.order.create({
            data: {
              orderNumber,
              customerId: user.id,
              status: 'DELIVERED',
              subtotal: opportunity.Amount,
              total: opportunity.Amount,
              currency: 'NZD',
              paymentStatus: 'PAID',
              paidAt: opportunity.CloseDate,
              deliveredAt: opportunity.CloseDate
            }
          });
        }
      }

      // Log sync operation
      await this.logSyncOperation(
        CrmOperation.SYNC,
        'opportunity',
        opportunity.Id,
        opportunity.Id,
        CrmSyncStatus.SUCCESS
      );
    } catch (error) {
      await this.logSyncOperation(
        CrmOperation.SYNC,
        'opportunity',
        opportunity.Id,
        null,
        CrmSyncStatus.FAILED,
        error.message
      );
      logger.error('Failed to sync opportunity to database', { opportunityId: opportunity.Id, error });
    }
  }

  /**
   * Map order status to Salesforce stage
   */
  private mapOrderStatusToSalesforceStage(status: string): string {
    const stageMap: { [key: string]: string } = {
      'PENDING': 'Prospecting',
      'CONFIRMED': 'Qualification',
      'PROCESSING': 'Proposal/Price Quote',
      'SHIPPED': 'Negotiation/Review',
      'DELIVERED': 'Closed Won',
      'CANCELLED': 'Closed Lost',
      'RETURNED': 'Closed Lost'
    };

    return stageMap[status] || 'Prospecting';
  }

  /**
   * Log CRM sync operation
   */
  private async logSyncOperation(
    operation: CrmOperation,
    entityType: string,
    entityId: string,
    externalId: string | null,
    status: CrmSyncStatus,
    errorMessage?: string
  ): Promise<void> {
    try {
      await prisma.crmSyncLog.create({
        data: {
          crmSystem: CrmSystem.SALESFORCE,
          operation,
          entityType,
          entityId,
          externalId,
          status,
          errorMessage
        }
      });
    } catch (error) {
      logger.error('Failed to log CRM sync operation', error);
    }
  }

  /**
   * Get sync statistics
   */
  async getSyncStats(): Promise<{
    totalSyncs: number;
    successfulSyncs: number;
    failedSyncs: number;
    lastSyncTime?: Date;
  }> {
    try {
      const stats = await prisma.crmSyncLog.aggregate({
        where: { crmSystem: CrmSystem.SALESFORCE },
        _count: { id: true }
      });

      const successfulSyncs = await prisma.crmSyncLog.count({
        where: {
          crmSystem: CrmSystem.SALESFORCE,
          status: CrmSyncStatus.SUCCESS
        }
      });

      const failedSyncs = await prisma.crmSyncLog.count({
        where: {
          crmSystem: CrmSystem.SALESFORCE,
          status: CrmSyncStatus.FAILED
        }
      });

      const lastSync = await prisma.crmSyncLog.findFirst({
        where: { crmSystem: CrmSystem.SALESFORCE },
        orderBy: { createdAt: 'desc' }
      });

      return {
        totalSyncs: stats._count.id,
        successfulSyncs,
        failedSyncs,
        lastSyncTime: lastSync?.createdAt
      };
    } catch (error) {
      logger.error('Failed to get sync stats', error);
      throw error;
    }
  }

  /**
   * Test connection to Salesforce
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.authenticate();
      const identity = await this.conn.identity();
      logger.info('Salesforce connection test successful', { identity });
      return true;
    } catch (error) {
      logger.error('Salesforce connection test failed', error);
      return false;
    }
  }
}

// Export singleton instance
export const salesforceService = new SalesforceService({
  loginUrl: process.env.SALESFORCE_LOGIN_URL || 'https://login.salesforce.com',
  username: process.env.SALESFORCE_USERNAME || '',
  password: process.env.SALESFORCE_PASSWORD || '',
  securityToken: process.env.SALESFORCE_SECURITY_TOKEN || '',
  clientId: process.env.SALESFORCE_CLIENT_ID || '',
  clientSecret: process.env.SALESFORCE_CLIENT_SECRET || ''
});