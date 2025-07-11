# Contributing to Studious Couscous

First off, thank you for considering contributing to Studious Couscous! It's people like you that make this project such a great tool for project management and collaboration.

## Code of Conduct

This project and everyone participating in it is governed by our Code of Conduct. By participating, you are expected to uphold this code.

## How Can I Contribute?

### Reporting Bugs

This section guides you through submitting a bug report for Studious Couscous. Following these guidelines helps maintainers and the community understand your report, reproduce the behavior, and find related reports.

**Before Submitting A Bug Report**

- Check the debugging guide
- Check the FAQs for a list of common questions and problems
- Perform a cursory search to see if the problem has already been reported

**How Do I Submit A (Good) Bug Report?**

Bugs are tracked as GitHub issues. Create an issue and provide the following information:

- Use a clear and descriptive title
- Describe the exact steps which reproduce the problem
- Provide specific examples to demonstrate the steps
- Describe the behavior you observed after following the steps
- Explain which behavior you expected to see instead and why
- Include screenshots and animated GIFs if applicable
- Include details about your configuration and environment

### Suggesting Enhancements

This section guides you through submitting an enhancement suggestion for Studious Couscous, including completely new features and minor improvements to existing functionality.

**Before Submitting An Enhancement Suggestion**

- Check if the enhancement has already been suggested
- Check if you're using the latest version
- Perform a cursory search to see if the enhancement has already been suggested

**How Do I Submit A (Good) Enhancement Suggestion?**

Enhancement suggestions are tracked as GitHub issues. Create an issue and provide the following information:

- Use a clear and descriptive title
- Provide a step-by-step description of the suggested enhancement
- Provide specific examples to demonstrate the steps
- Describe the current behavior and explain which behavior you expected to see instead
- Explain why this enhancement would be useful
- Include screenshots and animated GIFs if applicable

### Pull Requests

The process described here has several goals:

- Maintain the project's quality
- Fix problems that are important to users
- Engage the community in working toward the best possible project
- Enable a sustainable system for maintainers to review contributions

Please follow these steps to have your contribution considered by the maintainers:

1. Follow all instructions in the template
2. Follow the styleguides
3. After you submit your pull request, verify that all status checks are passing

## Development Setup

### Prerequisites

- Node.js (v18 or higher)
- Docker and Docker Compose
- Git

### Local Development

1. **Fork and clone the repository**
   ```bash
   git clone https://github.com/your-username/studious-couscous.git
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

4. **Start the development environment**
   ```bash
   npm run docker:up
   ```

5. **Run the development servers**
   ```bash
   npm run dev
   ```

### Testing

- Run all tests: `npm test`
- Run frontend tests: `npm run test:client`
- Run backend tests: `npm run test:server`
- Run E2E tests: `npm run test:e2e`

### Building

- Build all applications: `npm run build`
- Build frontend: `npm run build:client`
- Build backend: `npm run build:server`

## Styleguides

### Git Commit Messages

- Use the present tense ("Add feature" not "Added feature")
- Use the imperative mood ("Move cursor to..." not "Moves cursor to...")
- Limit the first line to 72 characters or less
- Reference issues and pull requests liberally after the first line
- Consider starting the commit message with an applicable emoji:
  - 🎉 `:tada:` when adding a new feature
  - 🐛 `:bug:` when fixing a bug
  - 📚 `:books:` when writing docs
  - 🎨 `:art:` when improving the format/structure of the code
  - 🔧 `:wrench:` when updating configuration files
  - ✅ `:white_check_mark:` when adding tests
  - 🔥 `:fire:` when removing code or files
  - ⚡ `:zap:` when improving performance

### TypeScript Styleguide

- Use TypeScript for all new code
- Follow the existing code style (enforced by ESLint and Prettier)
- Use explicit types when the type cannot be inferred
- Prefer interfaces over types for object definitions
- Use meaningful variable and function names
- Add JSDoc comments for public APIs

### CSS Styleguide

- Use Tailwind CSS classes for styling
- Follow the BEM methodology for custom CSS
- Use semantic HTML elements
- Ensure responsive design for all screen sizes
- Test for accessibility compliance

### React Styleguide

- Use functional components with hooks
- Follow the rules of hooks
- Use TypeScript props interfaces
- Implement error boundaries for error handling
- Use React.memo for performance optimization when appropriate
- Follow the component composition pattern

## Project Structure

```
studious-couscous/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/    # Reusable UI components
│   │   ├── pages/        # Page components
│   │   ├── hooks/        # Custom React hooks
│   │   ├── services/     # API service functions
│   │   ├── stores/       # State management
│   │   ├── utils/        # Utility functions
│   │   └── types/        # TypeScript type definitions
│   ├── public/           # Static assets
│   └── tests/           # Test files
├── server/               # Node.js backend
│   ├── src/
│   │   ├── controllers/  # Route controllers
│   │   ├── middleware/   # Express middleware
│   │   ├── models/      # Database models
│   │   ├── routes/      # API routes
│   │   ├── services/    # Business logic
│   │   ├── utils/       # Utility functions
│   │   └── types/       # TypeScript type definitions
│   ├── prisma/          # Database schema and migrations
│   └── tests/           # Test files
├── docs/                # Documentation
├── .github/             # GitHub Actions workflows
└── docker-compose.yml   # Docker Compose configuration
```

## Code Review Process

1. All code changes must be submitted via pull request
2. Pull requests require review from at least one maintainer
3. All automated checks must pass before merging
4. Code must follow the established style guidelines
5. Tests must be included for new features
6. Documentation must be updated for user-facing changes

## Recognition

Contributors will be recognized in the following ways:

- Listed in the project's README
- Mentioned in release notes for significant contributions
- Invited to join the contributor team for consistent contributions

## Questions?

Feel free to open an issue with your question or reach out to the maintainers directly.

Thank you for your interest in contributing to Studious Couscous!