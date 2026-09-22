const prisma = require('../lib/prisma');
const { readSessionToken, verifySessionToken } = require('../services/session');

async function requireAuth(request, response, next) {
  const session = verifySessionToken(readSessionToken(request));
  if (!session) {
    return response.status(401).json({ message: 'Faça login para acessar o painel.' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.sub },
      select: { id: true, name: true, email: true },
    });

    if (!user) {
      return response.status(401).json({ message: 'Sua sessão não é mais válida.' });
    }

    request.user = user;
    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = requireAuth;
