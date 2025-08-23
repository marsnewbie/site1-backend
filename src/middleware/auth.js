import { verifyToken } from '../lib/auth.js';
import { supabase } from '../lib/supabase.js';

// Authentication middleware
export async function authenticateUser(request, reply) {
  try {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      reply.code(401).send({ error: 'No token provided' });
      return null;
    }

    const token = authHeader.substring(7);
    const decoded = verifyToken(token);
    
    if (!decoded) {
      reply.code(401).send({ error: 'Invalid token' });
      return null;
    }

    // Get user from database
    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, first_name, last_name, telephone, postcode, address, street_name, city')
      .eq('id', decoded.userId)
      .single();

    if (error || !user) {
      reply.code(401).send({ error: 'User not found' });
      return null;
    }

    request.user = user;
    return user;
  } catch (error) {
    reply.code(401).send({ error: 'Authentication failed' });
    return null;
  }
}

// Optional authentication middleware (doesn't fail if no token)
export async function optionalAuth(request, reply) {
  try {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }

    const token = authHeader.substring(7);
    const decoded = verifyToken(token);
    
    if (!decoded) {
      return null;
    }

    // Get user from database
    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, first_name, last_name, telephone, postcode, address, street_name, city')
      .eq('id', decoded.userId)
      .single();

    if (error || !user) {
      return null;
    }

    request.user = user;
    return user;
  } catch (error) {
    return null;
  }
}
