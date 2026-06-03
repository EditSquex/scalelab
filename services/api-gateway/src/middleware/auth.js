/**
 * JWT Authentication Middleware
 *
 * Uses @fastify/jwt to verify Bearer tokens.
 * `authMiddleware` enforces authentication (returns 401 on failure).
 * `optionalAuth` attempts verification but allows the request through if it fails.
 */

/**
 * Strict JWT authentication — rejects unauthenticated requests.
 * Attach to routes that require a valid token.
 *
 * @param {FastifyRequest} request
 * @param {FastifyReply} reply
 */
export async function authMiddleware(request, reply) {
  try {
    await request.jwtVerify();
  } catch (err) {
    return reply.status(401).send({
      error: 'Unauthorized',
      message: 'A valid Bearer JWT token is required',
      hint: 'Call POST /api/token to obtain a demo token',
    });
  }
}

/**
 * Optional JWT authentication — enriches `request.user` if token is valid,
 * but does not block the request if no token is provided or verification fails.
 *
 * @param {FastifyRequest} request
 * @param {FastifyReply} reply
 */
export async function optionalAuth(request, reply) {
  try {
    await request.jwtVerify();
  } catch {
    request.user = null;
  }
}
