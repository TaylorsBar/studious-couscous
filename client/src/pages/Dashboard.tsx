import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Car,
  Wrench,
  Package,
  TrendingUp,
  DollarSign,
  Users,
  ShoppingCart,
  AlertTriangle,
  CheckCircle,
  Clock,
  Activity,
  BarChart3,
  Zap,
  Shield,
  Globe,
  Calendar,
  Bell,
  Search,
  Plus,
  Filter,
  Download,
  Settings,
  HelpCircle
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';

// Mock data - in production, this would come from your API
const mockData = {
  kpis: {
    totalRevenue: 2450000,
    revenueGrowth: 12.5,
    activeProjects: 47,
    completedProjects: 156,
    partsInStock: 12847,
    lowStockItems: 23,
    totalCustomers: 892,
    newCustomers: 34,
    averageOrderValue: 3250,
    orderGrowth: 8.3,
    blockchainVerified: 98.7,
    crmSyncStatus: 'healthy'
  },
  recentActivity: [
    {
      id: 1,
      type: 'order',
      title: 'New Order #KC-2024-001',
      description: 'Turbo kit for 2023 Toyota Supra',
      amount: 8500,
      customer: 'Auckland Performance',
      time: '2 minutes ago',
      status: 'confirmed'
    },
    {
      id: 2,
      type: 'blockchain',
      title: 'Part Verification Complete',
      description: 'Garrett GT2860RS verified on Hedera',
      txId: '0.0.123456@1234567890.123456789',
      time: '15 minutes ago',
      status: 'verified'
    },
    {
      id: 3,
      type: 'project',
      title: 'Build Completed',
      description: 'R34 GT-R engine rebuild finished',
      customer: 'Hamilton Motorsport',
      time: '1 hour ago',
      status: 'completed'
    },
    {
      id: 4,
      type: 'crm',
      title: 'CRM Sync Update',
      description: 'Salesforce sync completed - 15 records updated',
      time: '2 hours ago',
      status: 'synced'
    }
  ],
  salesData: [
    { month: 'Jan', sales: 185000, orders: 45 },
    { month: 'Feb', sales: 220000, orders: 52 },
    { month: 'Mar', sales: 195000, orders: 48 },
    { month: 'Apr', sales: 267000, orders: 61 },
    { month: 'May', sales: 298000, orders: 68 },
    { month: 'Jun', sales: 245000, orders: 55 }
  ],
  topCategories: [
    { name: 'Turbo Kits', value: 35, color: '#FF6B6B' },
    { name: 'Exhaust Systems', value: 25, color: '#4ECDC4' },
    { name: 'Suspension', value: 20, color: '#45B7D1' },
    { name: 'Engine Parts', value: 15, color: '#96CEB4' },
    { name: 'Electronics', value: 5, color: '#FFEAA7' }
  ],
  upcomingEvents: [
    {
      id: 1,
      title: 'Dyno Day - Hamilton',
      date: '2024-01-15',
      type: 'event',
      participants: 12
    },
    {
      id: 2,
      title: 'Parts Delivery - Auckland',
      date: '2024-01-16',
      type: 'delivery',
      items: 45
    },
    {
      id: 3,
      title: 'Customer Consultation',
      date: '2024-01-17',
      type: 'meeting',
      customer: 'Wellington Speed Shop'
    }
  ]
};

const Dashboard: React.FC = () => {
  const [timeRange, setTimeRange] = useState('7d');
  const [selectedMetric, setSelectedMetric] = useState('revenue');
  const [notifications, setNotifications] = useState(3);

  // Animation variants
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: {
        type: "spring",
        stiffness: 100
      }
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed':
      case 'completed':
      case 'verified':
      case 'synced':
        return 'text-green-600 bg-green-100';
      case 'pending':
        return 'text-yellow-600 bg-yellow-100';
      case 'failed':
      case 'error':
        return 'text-red-600 bg-red-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'order':
        return <ShoppingCart className="w-4 h-4" />;
      case 'blockchain':
        return <Shield className="w-4 h-4" />;
      case 'project':
        return <Wrench className="w-4 h-4" />;
      case 'crm':
        return <Users className="w-4 h-4" />;
      default:
        return <Activity className="w-4 h-4" />;
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-NZ', {
      style: 'currency',
      currency: 'NZD',
      minimumFractionDigits: 0
    }).format(amount);
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('en-NZ').format(num);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <motion.div 
        className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700"
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <Car className="w-8 h-8 text-red-600" />
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  Karapiro Cartel
                </h1>
              </div>
              <div className="hidden md:flex items-center space-x-2 text-sm text-gray-500 dark:text-gray-400">
                <Globe className="w-4 h-4" />
                <span>New Zealand's Premier Automotive Ecosystem</span>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search parts, orders, customers..."
                  className="pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                />
              </div>
              
              <button className="relative p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <Bell className="w-5 h-5" />
                {notifications > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                    {notifications}
                  </span>
                )}
              </button>
              
              <button className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <Settings className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="space-y-8"
        >
          {/* Quick Actions */}
          <motion.div variants={itemVariants} className="flex flex-wrap gap-4">
            <button className="flex items-center space-x-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">
              <Plus className="w-4 h-4" />
              <span>New Order</span>
            </button>
            <button className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
              <Package className="w-4 h-4" />
              <span>Add Part</span>
            </button>
            <button className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
              <Wrench className="w-4 h-4" />
              <span>New Project</span>
            </button>
            <button className="flex items-center space-x-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors">
              <Shield className="w-4 h-4" />
              <span>Verify Part</span>
            </button>
          </motion.div>

          {/* KPI Cards */}
          <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Revenue</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    {formatCurrency(mockData.kpis.totalRevenue)}
                  </p>
                  <p className="text-sm text-green-600 flex items-center">
                    <TrendingUp className="w-4 h-4 mr-1" />
                    +{mockData.kpis.revenueGrowth}%
                  </p>
                </div>
                <div className="p-3 bg-green-100 dark:bg-green-900 rounded-full">
                  <DollarSign className="w-6 h-6 text-green-600 dark:text-green-400" />
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Active Projects</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    {mockData.kpis.activeProjects}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {mockData.kpis.completedProjects} completed
                  </p>
                </div>
                <div className="p-3 bg-blue-100 dark:bg-blue-900 rounded-full">
                  <Wrench className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Parts in Stock</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    {formatNumber(mockData.kpis.partsInStock)}
                  </p>
                  <p className="text-sm text-red-600 flex items-center">
                    <AlertTriangle className="w-4 h-4 mr-1" />
                    {mockData.kpis.lowStockItems} low stock
                  </p>
                </div>
                <div className="p-3 bg-orange-100 dark:bg-orange-900 rounded-full">
                  <Package className="w-6 h-6 text-orange-600 dark:text-orange-400" />
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Blockchain Verified</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    {mockData.kpis.blockchainVerified}%
                  </p>
                  <p className="text-sm text-green-600 flex items-center">
                    <CheckCircle className="w-4 h-4 mr-1" />
                    Hedera Network
                  </p>
                </div>
                <div className="p-3 bg-purple-100 dark:bg-purple-900 rounded-full">
                  <Shield className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                </div>
              </div>
            </div>
          </motion.div>

          {/* Charts Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <motion.div variants={itemVariants} className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Sales Performance</h3>
                <select 
                  value={timeRange}
                  onChange={(e) => setTimeRange(e.target.value)}
                  className="text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1 dark:bg-gray-700 dark:text-white"
                >
                  <option value="7d">Last 7 days</option>
                  <option value="30d">Last 30 days</option>
                  <option value="90d">Last 90 days</option>
                  <option value="1y">Last year</option>
                </select>
              </div>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={mockData.salesData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip formatter={(value) => formatCurrency(value as number)} />
                  <Line type="monotone" dataKey="sales" stroke="#EF4444" strokeWidth={3} />
                </LineChart>
              </ResponsiveContainer>
            </motion.div>

            <motion.div variants={itemVariants} className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Top Categories</h3>
                <button className="text-sm text-red-600 hover:text-red-700">View All</button>
              </div>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={mockData.topCategories}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${value}%`}
                  >
                    {mockData.topCategories.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </motion.div>
          </div>

          {/* Recent Activity and Upcoming Events */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <motion.div variants={itemVariants} className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Recent Activity</h3>
                <button className="text-sm text-red-600 hover:text-red-700">View All</button>
              </div>
              <div className="space-y-4">
                {mockData.recentActivity.map((activity) => (
                  <div key={activity.id} className="flex items-start space-x-3">
                    <div className="flex-shrink-0 p-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
                      {getActivityIcon(activity.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {activity.title}
                        </p>
                        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(activity.status)}`}>
                          {activity.status}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        {activity.description}
                      </p>
                      <div className="flex items-center justify-between mt-2">
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {activity.time}
                        </p>
                        {activity.amount && (
                          <p className="text-sm font-medium text-green-600">
                            {formatCurrency(activity.amount)}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>

            <motion.div variants={itemVariants} className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Upcoming Events</h3>
                <button className="text-sm text-red-600 hover:text-red-700">View Calendar</button>
              </div>
              <div className="space-y-4">
                {mockData.upcomingEvents.map((event) => (
                  <div key={event.id} className="flex items-start space-x-3">
                    <div className="flex-shrink-0 p-2 bg-red-100 dark:bg-red-900 rounded-lg">
                      <Calendar className="w-4 h-4 text-red-600 dark:text-red-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {event.title}
                      </p>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        {new Date(event.date).toLocaleDateString('en-NZ', {
                          weekday: 'long',
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        })}
                      </p>
                      <div className="flex items-center mt-2">
                        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                          event.type === 'event' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' :
                          event.type === 'delivery' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                          'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
                        }`}>
                          {event.type}
                        </span>
                        <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                          {event.participants && `${event.participants} participants`}
                          {event.items && `${event.items} items`}
                          {event.customer && event.customer}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>

          {/* System Status */}
          <motion.div variants={itemVariants} className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">System Status</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="flex items-center space-x-3">
                <div className="flex-shrink-0 p-2 bg-green-100 dark:bg-green-900 rounded-lg">
                  <Shield className="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">Hedera Network</p>
                  <p className="text-sm text-green-600">Operational</p>
                </div>
              </div>
              
              <div className="flex items-center space-x-3">
                <div className="flex-shrink-0 p-2 bg-green-100 dark:bg-green-900 rounded-lg">
                  <Users className="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">CRM Sync</p>
                  <p className="text-sm text-green-600">Healthy</p>
                </div>
              </div>
              
              <div className="flex items-center space-x-3">
                <div className="flex-shrink-0 p-2 bg-green-100 dark:bg-green-900 rounded-lg">
                  <DollarSign className="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">Financial Sync</p>
                  <p className="text-sm text-green-600">Connected</p>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
};

export default Dashboard;