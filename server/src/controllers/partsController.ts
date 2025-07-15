import { Request, Response } from 'express'
import { prisma } from '@/config/database'
import { logger } from '@/utils/logger'
import { asyncHandler } from '@/utils/asyncHandler'
import { AppError } from '@/utils/AppError'
import { hederaGatewayService } from '@/services/hederaGatewayService'
import { crmSyncService } from '@/services/crmSyncService'
import { publishEvent, KAFKA_TOPICS } from '@/config/kafka'
import { z } from 'zod'

// Validation schemas
const createPartSchema = z.object({
  sku: z.string().min(1, 'SKU is required'),
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  manufacturerId: z.string().uuid('Invalid manufacturer ID'),
  categoryId: z.string().uuid('Invalid category ID'),
  price: z.number().positive('Price must be positive'),
  costPrice: z.number().positive('Cost price must be positive').optional(),
  weight: z.number().positive('Weight must be positive').optional(),
  dimensions: z.object({
    length: z.number().positive(),
    width: z.number().positive(),
    height: z.number().positive(),
    unit: z.enum(['mm', 'cm', 'in']),
  }).optional(),
  stockQuantity: z.number().int().min(0, 'Stock quantity must be non-negative'),
  lowStockThreshold: z.number().int().min(0, 'Low stock threshold must be non-negative'),
  warranty: z.string().optional(),
  // Performance fields for KC Speedshop
  horsepower: z.number().positive().optional(),
  torque: z.number().positive().optional(),
  materialType: z.string().optional(),
  finish: z.string().optional(),
  specifications: z.record(z.any()).optional(),
  images: z.array(z.string().url()).optional(),
  isFeatured: z.boolean().default(false),
  isActive: z.boolean().default(true),
})

const updatePartSchema = createPartSchema.partial()

const searchPartsSchema = z.object({
  query: z.string().optional(),
  categoryId: z.string().uuid().optional(),
  manufacturerId: z.string().uuid().optional(),
  minPrice: z.number().positive().optional(),
  maxPrice: z.number().positive().optional(),
  inStock: z.boolean().optional(),
  featured: z.boolean().optional(),
  sortBy: z.enum(['price', 'name', 'createdAt', 'horsepower', 'torque']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(20),
})

/**
 * @desc    Get all parts with filtering, sorting, and pagination
 * @route   GET /api/parts
 * @access  Public
 */
export const getParts = asyncHandler(async (req: Request, res: Response) => {
  const validatedQuery = searchPartsSchema.parse(req.query)
  const {
    query,
    categoryId,
    manufacturerId,
    minPrice,
    maxPrice,
    inStock,
    featured,
    sortBy,
    sortOrder,
    page,
    limit,
  } = validatedQuery

  const offset = (page - 1) * limit

  // Build where clause
  const where: any = {
    isActive: true,
  }

  if (query) {
    where.OR = [
      { name: { contains: query, mode: 'insensitive' } },
      { description: { contains: query, mode: 'insensitive' } },
      { sku: { contains: query, mode: 'insensitive' } },
    ]
  }

  if (categoryId) {
    where.categoryId = categoryId
  }

  if (manufacturerId) {
    where.manufacturerId = manufacturerId
  }

  if (minPrice !== undefined || maxPrice !== undefined) {
    where.price = {}
    if (minPrice !== undefined) where.price.gte = minPrice
    if (maxPrice !== undefined) where.price.lte = maxPrice
  }

  if (inStock !== undefined) {
    where.stockQuantity = inStock ? { gt: 0 } : { lte: 0 }
  }

  if (featured !== undefined) {
    where.isFeatured = featured
  }

  // Build orderBy clause
  const orderBy: any = {}
  orderBy[sortBy] = sortOrder

  try {
    const [parts, totalCount] = await Promise.all([
      prisma.part.findMany({
        where,
        include: {
          manufacturer: true,
          category: true,
          _count: {
            select: {
              orderItems: true,
              compatibility: true,
            },
          },
        },
        orderBy,
        skip: offset,
        take: limit,
      }),
      prisma.part.count({ where }),
    ])

    const totalPages = Math.ceil(totalCount / limit)

    res.status(200).json({
      success: true,
      data: parts,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    })
  } catch (error) {
    logger.error('Error fetching parts:', error)
    throw new AppError('Failed to fetch parts', 500)
  }
})

/**
 * @desc    Get part by ID
 * @route   GET /api/parts/:id
 * @access  Public
 */
export const getPartById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params

  const part = await prisma.part.findUnique({
    where: { id },
    include: {
      manufacturer: true,
      category: true,
      compatibility: {
        include: {
          vehicle: true,
        },
      },
      _count: {
        select: {
          orderItems: true,
          customerParts: true,
        },
      },
    },
  })

  if (!part) {
    throw new AppError('Part not found', 404)
  }

  // Get blockchain verification status
  const hederaTransactions = await hederaGatewayService.getTransactionHistory(id, 'part')

  res.status(200).json({
    success: true,
    data: {
      ...part,
      blockchain: {
        isVerified: part.isVerified,
        hederaTxId: part.hederaTxId,
        verifiedAt: part.verifiedAt,
        transactions: hederaTransactions,
      },
    },
  })
})

/**
 * @desc    Create new part
 * @route   POST /api/parts
 * @access  Private (Admin/Manager)
 */
export const createPart = asyncHandler(async (req: Request, res: Response) => {
  const validatedData = createPartSchema.parse(req.body)
  const userId = req.user?.id

  if (!userId) {
    throw new AppError('User not authenticated', 401)
  }

  try {
    // Check if SKU already exists
    const existingPart = await prisma.part.findUnique({
      where: { sku: validatedData.sku },
    })

    if (existingPart) {
      throw new AppError('Part with this SKU already exists', 400)
    }

    // Create the part
    const part = await prisma.part.create({
      data: {
        ...validatedData,
        dimensions: validatedData.dimensions || undefined,
        specifications: validatedData.specifications || undefined,
        images: validatedData.images || [],
      },
      include: {
        manufacturer: true,
        category: true,
      },
    })

    // Submit to Hedera blockchain for provenance verification
    try {
      await hederaGatewayService.submitPartProvenance({
        partId: part.id,
        sku: part.sku,
        name: part.name,
        manufacturerId: part.manufacturerId,
        price: part.price,
        specifications: part.specifications,
        registeredBy: userId,
        timestamp: new Date(),
      })

      logger.info(`Part ${part.id} submitted to Hedera blockchain`)
    } catch (hederaError) {
      logger.error('Failed to submit part to Hedera blockchain:', hederaError)
      // Continue with part creation even if blockchain submission fails
    }

    // Publish event to Kafka
    await publishEvent(
      KAFKA_TOPICS.PARTS_REGISTERED,
      part.id,
      {
        eventType: 'PART_REGISTERED',
        partId: part.id,
        sku: part.sku,
        name: part.name,
        manufacturerId: part.manufacturerId,
        categoryId: part.categoryId,
        price: part.price,
        registeredBy: userId,
        timestamp: new Date().toISOString(),
      }
    )

    res.status(201).json({
      success: true,
      data: part,
      message: 'Part created successfully and submitted for blockchain verification',
    })
  } catch (error) {
    logger.error('Error creating part:', error)
    throw new AppError('Failed to create part', 500)
  }
})

/**
 * @desc    Update part
 * @route   PUT /api/parts/:id
 * @access  Private (Admin/Manager)
 */
export const updatePart = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params
  const validatedData = updatePartSchema.parse(req.body)

  const existingPart = await prisma.part.findUnique({
    where: { id },
  })

  if (!existingPart) {
    throw new AppError('Part not found', 404)
  }

  // Check if SKU is being changed and if it conflicts
  if (validatedData.sku && validatedData.sku !== existingPart.sku) {
    const conflictingPart = await prisma.part.findUnique({
      where: { sku: validatedData.sku },
    })

    if (conflictingPart) {
      throw new AppError('Part with this SKU already exists', 400)
    }
  }

  try {
    const updatedPart = await prisma.part.update({
      where: { id },
      data: {
        ...validatedData,
        dimensions: validatedData.dimensions || undefined,
        specifications: validatedData.specifications || undefined,
        images: validatedData.images || undefined,
      },
      include: {
        manufacturer: true,
        category: true,
      },
    })

    // Publish update event
    await publishEvent(
      KAFKA_TOPICS.PARTS_UPDATED,
      updatedPart.id,
      {
        eventType: 'PART_UPDATED',
        partId: updatedPart.id,
        sku: updatedPart.sku,
        changes: validatedData,
        timestamp: new Date().toISOString(),
      }
    )

    res.status(200).json({
      success: true,
      data: updatedPart,
      message: 'Part updated successfully',
    })
  } catch (error) {
    logger.error('Error updating part:', error)
    throw new AppError('Failed to update part', 500)
  }
})

/**
 * @desc    Delete part
 * @route   DELETE /api/parts/:id
 * @access  Private (Admin)
 */
export const deletePart = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params

  const part = await prisma.part.findUnique({
    where: { id },
    include: {
      orderItems: true,
      customerParts: true,
    },
  })

  if (!part) {
    throw new AppError('Part not found', 404)
  }

  // Check if part is used in any orders
  if (part.orderItems.length > 0) {
    throw new AppError('Cannot delete part that has been ordered', 400)
  }

  try {
    // Soft delete by marking as inactive
    await prisma.part.update({
      where: { id },
      data: { isActive: false },
    })

    res.status(200).json({
      success: true,
      message: 'Part deleted successfully',
    })
  } catch (error) {
    logger.error('Error deleting part:', error)
    throw new AppError('Failed to delete part', 500)
  }
})

/**
 * @desc    Get part compatibility for a vehicle
 * @route   GET /api/parts/compatibility/:vehicleId
 * @access  Public
 */
export const getPartCompatibility = asyncHandler(async (req: Request, res: Response) => {
  const { vehicleId } = req.params
  const { page = 1, limit = 20 } = req.query

  const pageNum = parseInt(page as string)
  const limitNum = parseInt(limit as string)
  const offset = (pageNum - 1) * limitNum

  const [compatibleParts, totalCount] = await Promise.all([
    prisma.part.findMany({
      where: {
        compatibility: {
          some: {
            vehicleId,
          },
        },
        isActive: true,
      },
      include: {
        manufacturer: true,
        category: true,
      },
      skip: offset,
      take: limitNum,
      orderBy: {
        name: 'asc',
      },
    }),
    prisma.part.count({
      where: {
        compatibility: {
          some: {
            vehicleId,
          },
        },
        isActive: true,
      },
    }),
  ])

  const totalPages = Math.ceil(totalCount / limitNum)

  res.status(200).json({
    success: true,
    data: compatibleParts,
    pagination: {
      page: pageNum,
      limit: limitNum,
      totalCount,
      totalPages,
      hasNext: pageNum < totalPages,
      hasPrev: pageNum > 1,
    },
  })
})

/**
 * @desc    Get high-performance parts (featured automotive parts)
 * @route   GET /api/parts/high-performance
 * @access  Public
 */
export const getHighPerformanceParts = asyncHandler(async (req: Request, res: Response) => {
  const { category, minHorsepower, sortBy = 'horsepower' } = req.query

  const where: any = {
    isActive: true,
    isFeatured: true,
    OR: [
      { horsepower: { gt: 0 } },
      { torque: { gt: 0 } },
    ],
  }

  if (category) {
    where.category = {
      slug: category as string,
    }
  }

  if (minHorsepower) {
    where.horsepower = {
      gte: parseFloat(minHorsepower as string),
    }
  }

  const parts = await prisma.part.findMany({
    where,
    include: {
      manufacturer: true,
      category: true,
      _count: {
        select: {
          orderItems: true,
        },
      },
    },
    orderBy: {
      [sortBy as string]: 'desc',
    },
    take: 50,
  })

  res.status(200).json({
    success: true,
    data: parts,
    message: 'High-performance parts retrieved successfully',
  })
})

/**
 * @desc    Verify part authenticity via blockchain
 * @route   POST /api/parts/:id/verify
 * @access  Private
 */
export const verifyPartAuthenticity = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params

  const part = await prisma.part.findUnique({
    where: { id },
    include: {
      manufacturer: true,
    },
  })

  if (!part) {
    throw new AppError('Part not found', 404)
  }

  try {
    const transactions = await hederaGatewayService.getTransactionHistory(id, 'part')
    
    const verificationResult = {
      partId: part.id,
      sku: part.sku,
      name: part.name,
      manufacturer: part.manufacturer.name,
      isVerified: part.isVerified,
      hederaTxId: part.hederaTxId,
      verifiedAt: part.verifiedAt,
      blockchainTransactions: transactions,
      authenticity: {
        score: part.isVerified ? 100 : 0,
        status: part.isVerified ? 'VERIFIED' : 'PENDING',
        details: part.isVerified 
          ? 'Part authenticity verified on Hedera blockchain'
          : 'Part verification pending or failed',
      },
    }

    res.status(200).json({
      success: true,
      data: verificationResult,
    })
  } catch (error) {
    logger.error('Error verifying part authenticity:', error)
    throw new AppError('Failed to verify part authenticity', 500)
  }
})

/**
 * @desc    Get part analytics for KC Speedshop dashboard
 * @route   GET /api/parts/analytics
 * @access  Private (Admin/Manager)
 */
export const getPartAnalytics = asyncHandler(async (req: Request, res: Response) => {
  const { period = '30d' } = req.query
  
  const periodDays = period === '7d' ? 7 : period === '30d' ? 30 : 90
  const startDate = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000)

  const analytics = await Promise.all([
    // Total parts count
    prisma.part.count({
      where: { isActive: true },
    }),
    
    // Parts by category
    prisma.part.groupBy({
      by: ['categoryId'],
      where: { isActive: true },
      _count: true,
    }),
    
    // Top performing parts
    prisma.orderItem.groupBy({
      by: ['partId'],
      where: {
        order: {
          createdAt: { gte: startDate },
        },
      },
      _sum: {
        quantity: true,
        lineTotal: true,
      },
      orderBy: {
        _sum: {
          lineTotal: 'desc',
        },
      },
      take: 10,
    }),
    
    // Low stock alerts
    prisma.part.findMany({
      where: {
        isActive: true,
        stockQuantity: {
          lte: prisma.part.fields.lowStockThreshold,
        },
      },
      include: {
        manufacturer: true,
        category: true,
      },
      orderBy: {
        stockQuantity: 'asc',
      },
    }),
    
    // Blockchain verification stats
    prisma.part.groupBy({
      by: ['isVerified'],
      where: { isActive: true },
      _count: true,
    }),
  ])

  const [
    totalParts,
    partsByCategory,
    topPerformingParts,
    lowStockParts,
    verificationStats,
  ] = analytics

  res.status(200).json({
    success: true,
    data: {
      totalParts,
      partsByCategory,
      topPerformingParts,
      lowStockParts,
      verificationStats,
      period: `${periodDays} days`,
    },
  })
})

export {
  createPartSchema,
  updatePartSchema,
  searchPartsSchema,
}