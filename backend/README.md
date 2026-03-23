# Web3 Student Lab Backend

Backend API for the Web3 Student Lab platform, built with Node.js, Express, and TypeScript.

## 🚀 Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn

### Installation

```bash
cd backend
npm install
```

### Development

Run the development server with hot reload:

```bash
npm run dev
```

The server will start on `http://localhost:8080` (or the port specified in your `.env` file).

### Build

Build the TypeScript code:

```bash
npm run build
```

### Start Production Server

```bash
npm start
```

## 🧪 Testing

This project uses **Jest** and **Supertest** for integration testing.

### Run All Tests

```bash
npm test
```

### Run Tests in Watch Mode

Automatically re-run tests when files change:

```bash
npm run test:watch
```

### Run Tests with Coverage

Generate a coverage report:

```bash
npm run test:coverage
```

Coverage reports will be available in the `coverage/` directory. Open `coverage/lcov-report/index.html` in your browser to view the HTML report.

### Test Structure

Tests are located in the `tests/` directory:

```
tests/
├── setup.ts           # Test setup and configuration
├── health.test.ts     # Health endpoint tests
├── auth.test.ts       # Authentication module tests
└── learning.test.ts   # Learning module tests
```

### Writing New Tests

1. Create a new `.test.ts` file in the `tests/` directory
2. Import the `app` from `../src/index.js`
3. Use Supertest to make HTTP requests
4. Use Jest assertions to validate responses

Example:

```typescript
import request from 'supertest';
import { app } from '../src/index.js';

describe('My Module Tests', () => {
  describe('GET /api/my-endpoint', () => {
    it('should return expected data', async () => {
      const response = await request(app).get('/api/my-endpoint');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('data');
    });
  });
});
```

## 📁 Project Structure

```
backend/
├── src/
│   ├── index.ts              # Application entry point
│   ├── routes/
│   │   ├── auth/             # Authentication routes
│   │   │   ├── auth.routes.ts
│   │   │   └── types.ts
│   │   └── learning/         # Learning module routes
│   │       ├── learning.routes.ts
│   │       └── types.ts
│   ├── db/                   # Database configuration
│   └── generated/            # Generated code (e.g., Prisma)
├── tests/
│   ├── setup.ts              # Test setup
│   ├── health.test.ts        # Health endpoint tests
│   ├── auth.test.ts          # Auth module tests
│   └── learning.test.ts      # Learning module tests
├── jest.config.js            # Jest configuration
├── package.json
├── tsconfig.json
└── README.md
```

## 🔌 API Endpoints

### Health

- `GET /health` - Check server health status

### Authentication

- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user (protected route)

### Learning

- `GET /api/learning/modules` - Get all learning modules
- `GET /api/learning/modules/:moduleId` - Get specific module
- `GET /api/learning/progress/:userId` - Get user progress
- `POST /api/learning/progress/:userId/complete` - Mark lesson as complete

## 📝 Environment Variables

Create a `.env` file in the backend directory:

```env
PORT=8080
NODE_ENV=development
```

## 🤝 Contributing

Please read the main [CONTRIBUTING.md](../CONTRIBUTING.md) file for details on how to contribute to this project.

## 📜 License

MIT License - see the main [LICENSE](../LICENSE) file for details.
