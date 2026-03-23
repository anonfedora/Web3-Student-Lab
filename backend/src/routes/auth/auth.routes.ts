import { Router, Request, Response } from 'express';
import { LoginRequest, RegisterRequest, AuthResponse, User } from './types.js';

const router = Router();

// Mock user storage (in production, this would be a database)
const users: Map<string, User & { password: string }> = new Map();

// Generate a mock JWT token (in production, use a real JWT library)
const generateToken = (userId: string): string => {
  return `mock-jwt-token-${userId}-${Date.now()}`;
};

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user
 * @access  Public
 */
router.post('/register', (req: Request, res: Response) => {
  try {
    const { email, password, name }: RegisterRequest = req.body;

    // Validation
    if (!email || !password || !name) {
      res.status(400).json({ error: 'All fields are required' });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters' });
      return;
    }

    // Check if user already exists
    if (users.has(email)) {
      res.status(409).json({ error: 'User with this email already exists' });
      return;
    }

    // Create user
    const userId = `user-${Date.now()}`;
    const newUser: User & { password: string } = {
      id: userId,
      email,
      name,
      password, // In production, hash this!
    };

    users.set(email, newUser);

    // Generate token
    const token = generateToken(userId);

    res.status(201).json({
      user: { id: userId, email, name },
      token,
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @route   POST /api/auth/login
 * @desc    Login user
 * @access  Public
 */
router.post('/login', (req: Request, res: Response) => {
  try {
    const { email, password }: LoginRequest = req.body;

    // Validation
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    // Find user
    const user = users.get(email);

    if (!user || user.password !== password) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    // Generate token
    const token = generateToken(user.id);

    res.json({
      user: { id: user.id, email: user.email, name: user.name },
      token,
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @route   GET /api/auth/me
 * @desc    Get current user (protected route example)
 * @access  Private (simulated)
 */
router.get('/me', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authorization token required' });
    return;
  }

  // In production, verify the JWT token here
  const token = authHeader.split(' ')[1];

  if (!token) {
    res.status(401).json({ error: 'Invalid token format' });
    return;
  }

  // For demo purposes, extract user info from mock token
  if (!token.startsWith('mock-jwt-token-')) {
    res.status(401).json({ error: 'Invalid token' });
    return;
  }

  // Return mock user data
  res.json({
    user: {
      id: 'user-123',
      email: 'user@example.com',
      name: 'Test User',
    },
  });
});

export default router;
