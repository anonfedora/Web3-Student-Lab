import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth/auth.routes';
import learningRoutes from './routes/learning/learning.routes';

dotenv.config();

export const app = express();
const port = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', message: 'Web3 Student Lab Backend is running' });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/learning', learningRoutes);

if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });
}
