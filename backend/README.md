# Backend Setup Guide

## Prerequisites

- Node.js v20+ or v22+
- PostgreSQL 14+
- npm or pnpm

## Installation

1. Install dependencies:
```bash
npm install
```

2. Set up your environment variables:
```bash
cp .env.example .env
```

3. Update the `.env` file with your PostgreSQL connection string:
```
DATABASE_URL="postgresql://postgres:your-password@localhost:5432/web3-student-lab?schema=public"
PORT=8080
NODE_ENV=development
```

## Database Setup

### Option 1: Using Local PostgreSQL

1. Make sure PostgreSQL is running on your machine
2. Create a database named `web3-student-lab`:
```bash
createdb web3-student-lab
```

3. Run migrations:
```bash
npx prisma migrate deploy
```

### Option 2: Using Docker

```bash
docker run --name web3-student-lab-db \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=web3-student-lab \
  -p 5432:5432 \
  -d postgres:15
```

Then run migrations:
```bash
npx prisma migrate deploy
```

## Development

Start the development server:
```bash
npm run dev
```

The server will start on `http://localhost:8080` (or the port specified in `.env`).

## Building

Build the TypeScript project:
```bash
npm run build
```

## Running in Production

```bash
npm run build
npm start
```

## API Endpoints

All API endpoints are prefixed with `/api`:

- `GET /api/health` - Health check
- `GET /api/students` - List all students
- `POST /api/students` - Create a student
- `GET /api/students/:id` - Get student by ID
- `PUT /api/students/:id` - Update student
- `DELETE /api/students/:id` - Delete student

- `GET /api/courses` - List all courses
- `POST /api/courses` - Create a course
- `GET /api/courses/:id` - Get course by ID
- `PUT /api/courses/:id` - Update course
- `DELETE /api/courses/:id` - Delete course

- `GET /api/certificates` - List all certificates
- `POST /api/certificates` - Issue a certificate
- `GET /api/certificates/:id` - Get certificate by ID
- `PUT /api/certificates/:id` - Update certificate
- `DELETE /api/certificates/:id` - Revoke certificate

- `GET /api/enrollments` - List all enrollments
- `POST /api/enrollments` - Enroll a student
- `GET /api/enrollments/:id` - Get enrollment by ID
- `PUT /api/enrollments/:id` - Update enrollment
- `DELETE /api/enrollments/:id` - Unenroll student

## Project Structure

```
backend/
├── src/
│   ├── db/           # Database client and Prisma setup
│   ├── routes/       # Modular API routers
│   │   ├── index.ts  # Main router that mounts all feature routers
│   │   ├── students.ts
│   │   ├── courses.ts
│   │   ├── certificates.ts
│   │   └── enrollments.ts
│   ├── middleware/   # Express middleware
│   ├── generated/    # Generated Prisma client (auto-generated)
│   └── index.ts      # Application entry point
├── prisma/
│   ├── schema.prisma # Database schema definition
│   └── migrations/   # Database migrations
├── prisma.config.ts  # Prisma configuration
├── .env              # Environment variables (not committed)
├── .env.example      # Environment variables template
└── package.json
```

## Adding New Features

To add a new feature router:

1. Create a new file in `src/routes/yourFeature.ts`
2. Define your routes using Express Router
3. Export the router as default
4. Import and mount it in `src/routes/index.ts`:

```typescript
import yourFeatureRouter from './yourFeature.js';
router.use('/your-feature', yourFeatureRouter);
```

## Database Schema

The database includes the following models:

- **Student**: Student information (id, email, firstName, lastName)
- **Course**: Course details (id, title, description, instructor, credits)
- **Certificate**: Certificates issued to students (id, studentId, courseId, certificateHash, status)
- **Enrollment**: Student course enrollments (id, studentId, courseId, status)

## Troubleshooting

### Can't connect to database

- Ensure PostgreSQL is running
- Check your `DATABASE_URL` in `.env`
- Verify the database exists

### Prisma client not generated

Run:
```bash
npx prisma generate
```

### Migration errors

Reset the database (development only):
```bash
npx prisma migrate reset
```
