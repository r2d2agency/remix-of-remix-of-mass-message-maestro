import jwt from 'jsonwebtoken';
import { setRequestContext } from '../request-context.js';

export const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token não fornecido' });
  }

  const token = authHeader.replace('Bearer ', '');

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    req.userEmail = decoded.email;
    req.organizationId = decoded.organizationId || null;

    // enrich structured logs
    setRequestContext({ user_id: decoded.userId, user_email: decoded.email });

    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token inválido' });
  }
};

