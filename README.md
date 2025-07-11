# 🚀 Studious Couscous - Advanced Project Management Platform

A comprehensive, modern project management and collaboration platform built with cutting-edge technologies. This full-stack application features real-time collaboration, advanced project tracking, team management, and a beautiful, responsive user interface.

## ✨ Features

### 🎯 Core Features
- **Project Management**: Create, organize, and track projects with advanced filtering and sorting
- **Task Management**: Kanban boards, task assignments, priorities, and due dates
- **Team Collaboration**: Real-time chat, file sharing, and collaborative editing
- **User Management**: Role-based access control, team invitations, and user profiles
- **Real-time Updates**: WebSocket-powered live updates across all connected clients
- **Analytics Dashboard**: Comprehensive project analytics and reporting
- **File Management**: Secure file uploads and document sharing
- **Notifications**: Real-time notifications and email alerts

### 🎨 UI/UX Features
- **Modern Design**: Beautiful, responsive interface with dark/light mode
- **Interactive Components**: Drag-and-drop functionality, modal dialogs, and smooth animations
- **Mobile-First**: Fully responsive design that works on all devices
- **Accessibility**: WCAG 2.1 compliant with keyboard navigation and screen reader support
- **Internationalization**: Multi-language support with i18n

### 🔧 Technical Features
- **Authentication**: JWT-based authentication with refresh tokens
- **Database**: PostgreSQL with Prisma ORM for type-safe database operations
- **Caching**: Redis for session management and performance optimization
- **Real-time**: WebSocket integration for live collaboration
- **API**: RESTful API with comprehensive documentation
- **Testing**: Unit, integration, and E2E testing with high coverage
- **CI/CD**: Automated testing and deployment pipeline
- **Docker**: Full containerization for easy deployment
- **Security**: Input validation, rate limiting, and security headers

## 🛠️ Technology Stack

### Frontend
- **React 18** - Modern React with hooks and concurrent features
- **TypeScript** - Type-safe JavaScript for better development experience
- **Vite** - Fast build tool and development server
- **Tailwind CSS** - Utility-first CSS framework for rapid UI development
- **Framer Motion** - Smooth animations and transitions
- **React Query** - Data fetching and state management
- **React Router** - Client-side routing
- **React Hook Form** - Form handling with validation
- **Socket.io Client** - Real-time communication
- **Recharts** - Data visualization and analytics
- **React DnD** - Drag and drop functionality

### Backend
- **Node.js** - JavaScript runtime for server-side development
- **Express.js** - Web framework for Node.js
- **TypeScript** - Type-safe server-side development
- **Prisma** - Modern database toolkit and ORM
- **PostgreSQL** - Robust relational database
- **Redis** - In-memory data store for caching
- **Socket.io** - Real-time bidirectional event-based communication
- **JWT** - JSON Web Tokens for authentication
- **Bcrypt** - Password hashing
- **Multer** - File upload handling
- **Joi** - Data validation
- **Rate Limiter** - API rate limiting
- **Winston** - Logging framework

### DevOps & Tools
- **Docker** - Containerization platform
- **Docker Compose** - Multi-container Docker applications
- **GitHub Actions** - CI/CD pipeline
- **ESLint** - Code linting
- **Prettier** - Code formatting
- **Husky** - Git hooks
- **Jest** - Testing framework
- **Cypress** - End-to-end testing
- **Nginx** - Reverse proxy and load balancer

## 🚀 Quick Start

### Prerequisites
- Node.js 18.x or higher
- Docker and Docker Compose
- PostgreSQL (if running locally)
- Redis (if running locally)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/TaylorsBar/studious-couscous.git
   cd studious-couscous
   ```

2. **Install dependencies**
   ```bash
   npm run install:all
   ```

3. **Set up environment variables**
   ```bash
   cp server/.env.example server/.env
   cp client/.env.example client/.env
   ```

4. **Start with Docker (Recommended)**
   ```bash
   npm run docker:up
   ```

5. **Or start locally**
   ```bash
   # Start database and redis
   docker-compose up database redis -d
   
   # Set up database
   npm run db:setup
   
   # Start development servers
   npm run dev
   ```

### Access the Application
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:3001
- **API Documentation**: http://localhost:3001/docs

## 📁 Project Structure

```
studious-couscous/
├── client/                     # React frontend application
│   ├── src/
│   │   ├── components/        # Reusable UI components
│   │   ├── pages/            # Page components
│   │   ├── hooks/            # Custom React hooks
│   │   ├── services/         # API service functions
│   │   ├── stores/           # State management
│   │   ├── utils/            # Utility functions
│   │   ├── types/            # TypeScript type definitions
│   │   └── assets/           # Static assets
│   ├── public/               # Public assets
│   ├── tests/               # Test files
│   └── Dockerfile           # Docker configuration
├── server/                   # Node.js backend application
│   ├── src/
│   │   ├── controllers/      # Route controllers
│   │   ├── middleware/       # Express middleware
│   │   ├── models/          # Database models
│   │   ├── routes/          # API routes
│   │   ├── services/        # Business logic
│   │   ├── utils/           # Utility functions
│   │   ├── types/           # TypeScript type definitions
│   │   └── config/          # Configuration files
│   ├── prisma/              # Database schema and migrations
│   ├── tests/               # Test files
│   └── Dockerfile           # Docker configuration
├── docs/                     # Documentation
├── .github/                  # GitHub Actions workflows
├── docker-compose.yml        # Docker Compose configuration
├── nginx.conf               # Nginx configuration
└── README.md               # This file
```

## 🧪 Testing

### Running Tests
```bash
# Run all tests
npm test

# Run frontend tests
npm run test:client

# Run backend tests
npm run test:server

# Run E2E tests
cd client && npm run test:e2e
```

### Test Coverage
- **Frontend**: Jest + React Testing Library
- **Backend**: Jest + Supertest
- **E2E**: Cypress
- **Coverage**: Comprehensive test coverage with reports

## 🚀 Deployment

### Docker Deployment
```bash
# Build and start all services
npm run docker:build
npm run docker:up

# Production deployment
docker-compose --profile production up -d
```

### Manual Deployment
1. Build the applications
   ```bash
   npm run build
   ```

2. Set up production environment variables

3. Deploy to your preferred platform (AWS, Google Cloud, Azure, etc.)

## 🔧 Development

### Available Scripts
- `npm run dev` - Start development servers
- `npm run build` - Build for production
- `npm run test` - Run tests
- `npm run lint` - Run linting
- `npm run docker:up` - Start Docker containers
- `npm run db:setup` - Set up database

### Code Quality
- **ESLint**: Code linting with strict rules
- **Prettier**: Consistent code formatting
- **Husky**: Pre-commit hooks for code quality
- **TypeScript**: Type safety across the entire stack

## 📊 API Documentation

The API is fully documented using OpenAPI/Swagger specification. Access the interactive documentation at:
- Development: http://localhost:3001/docs
- Production: https://your-domain.com/docs

## 🔒 Security

- JWT-based authentication with refresh tokens
- Password hashing with bcrypt
- Input validation and sanitization
- Rate limiting to prevent abuse
- CORS configuration
- Security headers (helmet.js)
- SQL injection prevention
- XSS protection

## 🌐 Environment Variables

### Server (.env)
```env
NODE_ENV=development
PORT=3001
DATABASE_URL=postgresql://user:password@localhost:5432/studious_couscous
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-super-secret-jwt-key
JWT_REFRESH_SECRET=your-super-secret-refresh-key
CORS_ORIGIN=http://localhost:3000
```

### Client (.env)
```env
REACT_APP_API_URL=http://localhost:3001
REACT_APP_WS_URL=ws://localhost:3001
```

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](docs/CONTRIBUTING.md) for details.

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- React team for the amazing framework
- Node.js community for the robust ecosystem
- All open-source contributors who made this project possible

## 📞 Support

For questions, issues, or suggestions:
- Create an issue on GitHub
- Email: support@studious-couscous.com
- Documentation: https://docs.studious-couscous.com

---

**Happy coding! 🚀**