const express = require('express');
const prisma = require('../lib/prisma');
const requireAuth = require('../middleware/requireAuth');
const { hashPassword, verifyPassword } = require('../services/passwords');
const { clearSessionCookie, setSessionCookie } = require('../services/session');

const router = express.Router();
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email };
}

function validateRegistration(body) {
  const name = String(body.name ?? '').trim();
  const email = String(body.email ?? '').trim().toLowerCase();
  const password = String(body.password ?? '');

  if (name.length < 2 || name.length > 100) {
    return { error: 'Informe seu nome com pelo menos 2 caracteres.' };
  }
  if (email.length > 254 || !emailPattern.test(email)) {
    return { error: 'Informe um e-mail válido.' };
  }
  if (password.length < 8 || password.length > 128) {
    return { error: 'A senha deve ter entre 8 e 128 caracteres.' };
  }

  return { name, email, password };
}

router.post('/register', async (request, response, next) => {
  const data = validateRegistration(request.body);
  if (data.error) {
    return response.status(400).json({ message: data.error });
  }

  try {
    const user = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        passwordHash: await hashPassword(data.password),
      },
    });

    setSessionCookie(response, user);
    return response.status(201).json({ user: publicUser(user) });
  } catch (error) {
    if (error.code === 'P2002') {
      return response.status(409).json({ message: 'Já existe uma conta com este e-mail.' });
    }
    return next(error);
  }
});

router.post('/login', async (request, response, next) => {
  const email = String(request.body.email ?? '').trim().toLowerCase();
  const password = String(request.body.password ?? '');

  if (!email || !password) {
    return response.status(400).json({ message: 'Informe e-mail e senha.' });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return response.status(401).json({ message: 'E-mail ou senha incorretos.' });
    }

    setSessionCookie(response, user);
    return response.json({ user: publicUser(user) });
  } catch (error) {
    return next(error);
  }
});

router.post('/logout', (_request, response) => {
  clearSessionCookie(response);
  return response.status(204).send();
});

router.get('/me', requireAuth, (request, response) => {
  return response.json({ user: request.user });
});

module.exports = router;
