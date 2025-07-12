import { XeroClient } from 'xero-node';
import { prisma } from '../../config/database';
import { logger } from '../../config/logger';

export interface XeroConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
  tenantId?: string;
}

export interface XeroContact {
  ContactID?: string;
  Name: string;
  EmailAddress?: string;
  Phones?: Array<{
    PhoneType: 'DEFAULT' | 'DDI' | 'MOBILE' | 'FAX';
    PhoneNumber: string;
  }>;
  Addresses?: Array<{
    AddressType: 'POBOX' | 'STREET';
    AddressLine1?: string;
    AddressLine2?: string;
    City?: string;
    Region?: string;
    PostalCode?: string;
    Country?: string;
  }>;
  TaxNumber?: string;
  DefaultCurrency?: string;
  IsCustomer?: boolean;
  IsSupplier?: boolean;
}

export interface XeroInvoice {
  InvoiceID?: string;
  Type: 'ACCPAY' | 'ACCREC';
  Contact: {
    ContactID: string;
  };
  Date: string;
  DueDate?: string;
  InvoiceNumber?: string;
  Reference?: string;
  BrandingThemeID?: string;
  CurrencyCode?: string;
  Status?: 'DRAFT' | 'SUBMITTED' | 'AUTHORISED' | 'PAID' | 'VOIDED';
  LineItems: Array<{
    Description: string;
    Quantity: number;
    UnitAmount: number;
    LineAmount?: number;
    AccountCode?: string;
    TaxType?: string;
    ItemCode?: string;
  }>;
  SubTotal?: number;
  TotalTax?: number;
  Total?: number;
}

export interface XeroPayment {
  PaymentID?: string;
  Invoice: {
    InvoiceID: string;
  };
  Account: {
    Code: string;
  };
  Date: string;
  Amount: number;
  Reference?: string;
  CurrencyRate?: number;
}

export class XeroService {
  private xeroClient: XeroClient;
  private isConnected = false;
  private tokenSet: any;

  constructor(private config: XeroConfig) {
    this.xeroClient = new XeroClient({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      redirectUris: [config.redirectUri],
      scopes: config.scopes,
      httpTimeout: 30000
    });
  }

  /**
   * Initialize Xero connection with stored tokens
   */
  async initialize(): Promise<void> {
    try {
      // Try to load existing token from database or environment
      const storedToken = process.env.XERO_TOKEN_SET;
      if (storedToken) {
        this.tokenSet = JSON.parse(storedToken);
        await this.xeroClient.setTokenSet(this.tokenSet);
        this.isConnected = true;
        logger.info('Xero client initialized with stored tokens');
      } else {
        logger.warn('No Xero tokens found. Authorization required.');
      }
    } catch (error) {
      logger.error('Failed to initialize Xero client', error);
      throw error;
    }
  }

  /**
   * Get authorization URL for OAuth flow
   */
  getAuthorizationUrl(): string {
    return this.xeroClient.buildConsentUrl();
  }

  /**
   * Handle OAuth callback and exchange code for tokens
   */
  async handleCallback(code: string): Promise<void> {
    try {
      this.tokenSet = await this.xeroClient.apiCallback(code);
      this.isConnected = true;
      
      // Store tokens securely (in production, use encrypted storage)
      process.env.XERO_TOKEN_SET = JSON.stringify(this.tokenSet);
      
      logger.info('Xero authorization successful');
    } catch (error) {
      logger.error('Failed to handle Xero callback', error);
      throw error;
    }
  }

  /**
   * Refresh access token if needed
   */
  private async refreshTokenIfNeeded(): Promise<void> {
    try {
      if (!this.tokenSet || !this.isConnected) {
        throw new Error('Xero not connected');
      }

      const tokenSet = await this.xeroClient.readTokenSet();
      if (tokenSet.expired()) {
        const newTokenSet = await this.xeroClient.refreshToken();
        this.tokenSet = newTokenSet;
        process.env.XERO_TOKEN_SET = JSON.stringify(this.tokenSet);
        logger.info('Xero token refreshed');
      }
    } catch (error) {
      logger.error('Failed to refresh Xero token', error);
      throw error;
    }
  }

  /**
   * Sync customer to Xero as Contact
   */
  async syncCustomerToXero(userId: string): Promise<string> {
    try {
      await this.refreshTokenIfNeeded();

      const user = await prisma.user.findUnique({
        where: { id: userId }
      });

      if (!user) {
        throw new Error('User not found');
      }

      const contactData: XeroContact = {
        Name: user.companyName || `${user.firstName} ${user.lastName}`,
        EmailAddress: user.email,
        Phones: user.phoneNumber ? [{
          PhoneType: 'DEFAULT',
          PhoneNumber: user.phoneNumber
        }] : undefined,
        TaxNumber: user.taxId,
        DefaultCurrency: 'NZD',
        IsCustomer: true,
        IsSupplier: false
      };

      let contactId: string;

      if (user.xeroId) {
        // Update existing contact
        const response = await this.xeroClient.accountingApi.updateContact(
          this.config.tenantId!,
          user.xeroId,
          { contacts: [contactData] }
        );
        contactId = response.body.contacts![0].contactID!;
      } else {
        // Create new contact
        const response = await this.xeroClient.accountingApi.createContacts(
          this.config.tenantId!,
          { contacts: [contactData] }
        );
        contactId = response.body.contacts![0].contactID!;

        // Update user with Xero ID
        await prisma.user.update({
          where: { id: userId },
          data: { xeroId: contactId }
        });
      }

      logger.info('Successfully synced customer to Xero', { userId, contactId });
      return contactId;
    } catch (error) {
      logger.error('Failed to sync customer to Xero', { userId, error });
      throw error;
    }
  }

  /**
   * Create invoice in Xero from order
   */
  async createInvoiceFromOrder(orderId: string): Promise<string> {
    try {
      await this.refreshTokenIfNeeded();

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

      // Ensure customer is synced to Xero
      let contactId = order.customer.xeroId;
      if (!contactId) {
        contactId = await this.syncCustomerToXero(order.customer.id);
      }

      const invoiceData: XeroInvoice = {
        Type: 'ACCREC',
        Contact: {
          ContactID: contactId
        },
        Date: order.createdAt.toISOString().split('T')[0],
        DueDate: order.createdAt.toISOString().split('T')[0], // Same day for now
        InvoiceNumber: order.orderNumber,
        Reference: `Order ${order.orderNumber}`,
        CurrencyCode: order.currency,
        Status: 'AUTHORISED',
        LineItems: order.items.map(item => ({
          Description: item.part.name,
          Quantity: item.quantity,
          UnitAmount: item.unitPrice,
          LineAmount: item.lineTotal,
          AccountCode: '200', // Sales account
          TaxType: 'OUTPUT2', // 15% GST in NZ
          ItemCode: item.part.sku
        }))
      };

      const response = await this.xeroClient.accountingApi.createInvoices(
        this.config.tenantId!,
        { invoices: [invoiceData] }
      );

      const invoiceId = response.body.invoices![0].invoiceID!;

      // Update invoice in database with Xero ID
      await prisma.invoice.upsert({
        where: { orderId },
        update: {
          xeroId: invoiceId,
          syncedAt: new Date()
        },
        create: {
          invoiceNumber: order.orderNumber,
          customerId: order.customerId,
          orderId: order.id,
          status: 'SENT',
          subtotal: order.subtotal,
          tax: order.tax,
          total: order.total,
          xeroId: invoiceId,
          syncedAt: new Date()
        }
      });

      logger.info('Successfully created invoice in Xero', { orderId, invoiceId });
      return invoiceId;
    } catch (error) {
      logger.error('Failed to create invoice in Xero', { orderId, error });
      throw error;
    }
  }

  /**
   * Record payment in Xero
   */
  async recordPayment(orderId: string, paymentAmount: number, paymentDate: Date): Promise<string> {
    try {
      await this.refreshTokenIfNeeded();

      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: { invoice: true }
      });

      if (!order || !order.invoice?.xeroId) {
        throw new Error('Order or Xero invoice not found');
      }

      const paymentData: XeroPayment = {
        Invoice: {
          InvoiceID: order.invoice.xeroId
        },
        Account: {
          Code: '090' // Bank account
        },
        Date: paymentDate.toISOString().split('T')[0],
        Amount: paymentAmount,
        Reference: `Payment for Order ${order.orderNumber}`
      };

      const response = await this.xeroClient.accountingApi.createPayments(
        this.config.tenantId!,
        { payments: [paymentData] }
      );

      const paymentId = response.body.payments![0].paymentID!;

      // Update invoice status
      await prisma.invoice.update({
        where: { id: order.invoice.id },
        data: {
          status: 'PAID',
          paidAt: paymentDate
        }
      });

      logger.info('Successfully recorded payment in Xero', { orderId, paymentId });
      return paymentId;
    } catch (error) {
      logger.error('Failed to record payment in Xero', { orderId, error });
      throw error;
    }
  }

  /**
   * Sync invoices from Xero to local database
   */
  async syncInvoicesFromXero(): Promise<void> {
    try {
      await this.refreshTokenIfNeeded();

      const response = await this.xeroClient.accountingApi.getInvoices(
        this.config.tenantId!,
        undefined, // ifModifiedSince
        undefined, // where
        undefined, // order
        undefined, // IDs
        undefined, // invoiceNumbers
        undefined, // contactIDs
        undefined, // statuses
        undefined, // includeArchived
        undefined, // createdByMyApp
        undefined, // unitdp
        undefined, // summaryOnly
        undefined, // searchTerm
        1 // page
      );

      const invoices = response.body.invoices || [];

      for (const xeroInvoice of invoices) {
        await this.syncInvoiceToDatabase(xeroInvoice);
      }

      logger.info('Successfully synced invoices from Xero', { count: invoices.length });
    } catch (error) {
      logger.error('Failed to sync invoices from Xero', error);
      throw error;
    }
  }

  /**
   * Sync single invoice to database
   */
  private async syncInvoiceToDatabase(xeroInvoice: any): Promise<void> {
    try {
      // Find corresponding customer
      const customer = await prisma.user.findFirst({
        where: { xeroId: xeroInvoice.contact?.contactID }
      });

      if (!customer) {
        logger.warn('Customer not found for Xero invoice', { 
          invoiceId: xeroInvoice.invoiceID 
        });
        return;
      }

      // Find corresponding order
      const order = await prisma.order.findFirst({
        where: { orderNumber: xeroInvoice.invoiceNumber }
      });

      const invoiceData = {
        invoiceNumber: xeroInvoice.invoiceNumber,
        customerId: customer.id,
        orderId: order?.id,
        status: this.mapXeroStatusToLocal(xeroInvoice.status),
        subtotal: xeroInvoice.subTotal || 0,
        tax: xeroInvoice.totalTax || 0,
        total: xeroInvoice.total || 0,
        dueDate: xeroInvoice.dueDate ? new Date(xeroInvoice.dueDate) : undefined,
        paidAt: xeroInvoice.status === 'PAID' ? new Date() : undefined,
        xeroId: xeroInvoice.invoiceID,
        syncedAt: new Date()
      };

      await prisma.invoice.upsert({
        where: { xeroId: xeroInvoice.invoiceID },
        update: invoiceData,
        create: invoiceData
      });

      logger.debug('Synced invoice to database', { invoiceId: xeroInvoice.invoiceID });
    } catch (error) {
      logger.error('Failed to sync invoice to database', { 
        invoiceId: xeroInvoice.invoiceID, 
        error 
      });
    }
  }

  /**
   * Map Xero invoice status to local status
   */
  private mapXeroStatusToLocal(xeroStatus: string): string {
    const statusMap: { [key: string]: string } = {
      'DRAFT': 'DRAFT',
      'SUBMITTED': 'SENT',
      'AUTHORISED': 'SENT',
      'PAID': 'PAID',
      'VOIDED': 'CANCELLED'
    };

    return statusMap[xeroStatus] || 'DRAFT';
  }

  /**
   * Get financial reports from Xero
   */
  async getFinancialReports(): Promise<{
    profitAndLoss: any;
    balanceSheet: any;
    cashflow: any;
  }> {
    try {
      await this.refreshTokenIfNeeded();

      const [profitAndLoss, balanceSheet, cashflow] = await Promise.all([
        this.xeroClient.accountingApi.getReportProfitAndLoss(
          this.config.tenantId!,
          undefined, // fromDate
          undefined, // toDate
          undefined, // periods
          undefined, // timeframe
          undefined, // trackingCategoryID
          undefined, // trackingCategoryID2
          undefined, // trackingOptionID
          undefined, // trackingOptionID2
          undefined, // standardLayout
          undefined  // paymentsOnly
        ),
        this.xeroClient.accountingApi.getReportBalanceSheet(
          this.config.tenantId!,
          undefined, // date
          undefined, // periods
          undefined, // timeframe
          undefined, // trackingCategoryID
          undefined, // trackingCategoryID2
          undefined, // trackingOptionID
          undefined, // trackingOptionID2
          undefined  // standardLayout
        ),
        this.xeroClient.accountingApi.getReportCashSummary(
          this.config.tenantId!,
          undefined, // fromDate
          undefined  // toDate
        )
      ]);

      return {
        profitAndLoss: profitAndLoss.body,
        balanceSheet: balanceSheet.body,
        cashflow: cashflow.body
      };
    } catch (error) {
      logger.error('Failed to get financial reports from Xero', error);
      throw error;
    }
  }

  /**
   * Test connection to Xero
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.refreshTokenIfNeeded();
      
      const response = await this.xeroClient.accountingApi.getOrganisations(
        this.config.tenantId!
      );
      
      logger.info('Xero connection test successful', { 
        organisation: response.body.organisations![0].name 
      });
      return true;
    } catch (error) {
      logger.error('Xero connection test failed', error);
      return false;
    }
  }

  /**
   * Get account balances
   */
  async getAccountBalances(): Promise<any[]> {
    try {
      await this.refreshTokenIfNeeded();

      const response = await this.xeroClient.accountingApi.getAccounts(
        this.config.tenantId!
      );

      return response.body.accounts || [];
    } catch (error) {
      logger.error('Failed to get account balances from Xero', error);
      throw error;
    }
  }

  /**
   * Create expense from supplier invoice
   */
  async createExpense(supplierId: string, amount: number, description: string): Promise<string> {
    try {
      await this.refreshTokenIfNeeded();

      const supplier = await prisma.user.findUnique({
        where: { id: supplierId }
      });

      if (!supplier) {
        throw new Error('Supplier not found');
      }

      // Ensure supplier is synced to Xero
      let contactId = supplier.xeroId;
      if (!contactId) {
        contactId = await this.syncCustomerToXero(supplierId);
      }

      const expenseData: XeroInvoice = {
        Type: 'ACCPAY',
        Contact: {
          ContactID: contactId
        },
        Date: new Date().toISOString().split('T')[0],
        DueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 days
        Reference: `Expense - ${description}`,
        CurrencyCode: 'NZD',
        Status: 'AUTHORISED',
        LineItems: [{
          Description: description,
          Quantity: 1,
          UnitAmount: amount,
          LineAmount: amount,
          AccountCode: '400', // Expense account
          TaxType: 'INPUT2' // 15% GST in NZ
        }]
      };

      const response = await this.xeroClient.accountingApi.createInvoices(
        this.config.tenantId!,
        { invoices: [expenseData] }
      );

      const expenseId = response.body.invoices![0].invoiceID!;

      logger.info('Successfully created expense in Xero', { supplierId, expenseId });
      return expenseId;
    } catch (error) {
      logger.error('Failed to create expense in Xero', { supplierId, error });
      throw error;
    }
  }
}

// Export singleton instance
export const xeroService = new XeroService({
  clientId: process.env.XERO_CLIENT_ID || '',
  clientSecret: process.env.XERO_CLIENT_SECRET || '',
  redirectUri: process.env.XERO_REDIRECT_URI || 'http://localhost:3001/auth/xero/callback',
  scopes: ['accounting.transactions', 'accounting.contacts', 'accounting.settings'],
  tenantId: process.env.XERO_TENANT_ID
});