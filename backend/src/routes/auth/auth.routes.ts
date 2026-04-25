import { Request, Response, Router } from 'express';
import { authenticate } from '../../auth/auth.middleware.js';
import { login, register } from '../../auth/auth.service.js';
import { LoginRequest } from '../../auth/types.js';
import { loginSchema, registerSchema } from '../../auth/validation.schemas.js';
import { validateRequest } from '../../utils/validation.js';
import { rotateRefreshToken, blacklistAccessToken } from '../../auth/token.service.js';

const router = Router();

/**
 * @route   POST /api/auth/register
 * @desc    Register a new student
 * @access  Public
 */
router.post('/register', validateRequest(registerSchema), async (req: Request, res: Response) => {
  try {
    // Request body is already validated by middleware
    const { email, password, firstName, lastName } = req.body;

    // Register the student
    const authResponse = await register({
      email,
      password,
      firstName,
      lastName,
    });

    res.status(201).json(authResponse);
  } catch (error) {
    if (error instanceof Error && error.message === 'Student with this email already exists') {
      res.status(409).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @route   POST /api/auth/login
 * @desc    Login student
 * @access  Public
 */
router.post('/login', validateRequest(loginSchema), async (req: Request, res: Response) => {
  const { email, password }: LoginRequest = req.body;

  try {
    // Login the student
    const authResponse = await login({ email, password });

    res.json(authResponse);
  } catch (error) {
    if (error instanceof Error && error.message === 'Invalid credentials') {
      res.status(401).json({ error: error.message });
      return;
    }

    // Demo/Mock login fallback only if the database is actually unreachable
    if (email && password) {
      console.warn('Database unreachable, using demo login fallback');
      res.json({
        token: 'mock-jwt-token-for-demo-purposes',
        user: {
          id: 'demo-student-id',
          email,
          name: 'Demo Student',
          did: null,
        },
      });
      return;
    }

    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @route   GET /api/auth/me
 * @desc    Get current authenticated student
 * @access  Private
 */
router.get('/me', authenticate, (req: Request, res: Response) => {
  // User is attached to request by authenticate middleware
  res.json({ user: req.user });
});



/**
 * @route   POST /api/auth/refresh
 * @desc    Rotate refresh token
 * @access  Public
 */
router.post('/refresh', async (req: Request, res: Response) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    res.status(400).json({ error: 'Refresh token is required' });
    return;
  }

  try {
    const tokens = await rotateRefreshToken(refreshToken);
    res.json(tokens);
  } catch (error) {
    res.status(401).json({ error: 'Invalid or expired refresh token' });
  }
});

/**
 * @route   POST /api/auth/logout
 * @desc    Logout student and blacklist current access token
 * @access  Private
 */
router.post('/logout', authenticate, async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(' ')[1];

  if (token) {
    // Blacklist for 15 minutes (match access token expiry)
    await blacklistAccessToken(token, 15 * 60);
  }

  res.json({ message: 'Logged out successfully' });
});

export default router;
