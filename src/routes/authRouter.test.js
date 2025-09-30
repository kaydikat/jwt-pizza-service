const request = require('supertest');
const app = require('../service');

if (process.env.VSCODE_INSPECTOR_OPTIONS) {
  jest.setTimeout(60 * 1000 * 5); // 5 minutes
}

function randomName() {
  return Math.random().toString(36).substring(2, 12);
}

const testUser = { name: 'pizza diner', email: 'reg@test.com', password: 'a' };
let testUserAuthToken;

beforeAll(async () => {
  testUser.email = Math.random().toString(36).substring(2, 12) + '@test.com';
  const registerRes = await request(app).post('/api/auth').send(testUser);
  testUserAuthToken = registerRes.body.token;
  expectValidJwt(testUserAuthToken);
});

test('register', async () => {
  const newUser = {
    name: randomName(),
    email: randomName() + '@test.com',
    password: 'password123'
  };
  
  const registerRes = await request(app).post('/api/auth').send(newUser);
  expect(registerRes.status).toBe(200);
  expect(registerRes.body.user.name).toBe(newUser.name);
  expect(registerRes.body.user.email).toBe(newUser.email);
  expect(registerRes.body.user.password).toBeUndefined();
  expect(registerRes.body.user.roles).toEqual([{ role: 'diner' }]);
  expectValidJwt(registerRes.body.token);
});

test('register with missing fields', async () => {
  // Missing name
  let registerRes = await request(app).post('/api/auth').send({
    email: randomName() + '@test.com',
    password: 'password123'
  });
  expect(registerRes.status).toBe(400);
  expect(registerRes.body.message).toBe('name, email, and password are required');

  // Missing email
  registerRes = await request(app).post('/api/auth').send({
    name: randomName(),
    password: 'password123'
  });
  expect(registerRes.status).toBe(400);
  expect(registerRes.body.message).toBe('name, email, and password are required');

  // Missing password
  registerRes = await request(app).post('/api/auth').send({
    name: randomName(),
    email: randomName() + '@test.com'
  });
  expect(registerRes.status).toBe(400);
  expect(registerRes.body.message).toBe('name, email, and password are required');
});

test('login', async () => {
  const loginRes = await request(app).put('/api/auth').send(testUser);
  expect(loginRes.status).toBe(200);
  expectValidJwt(loginRes.body.token);

  const expectedUser = { ...testUser, roles: [{ role: 'diner' }] };
  delete expectedUser.password;
  expect(loginRes.body.user).toMatchObject(expectedUser);
});

test('login with wrong password', async () => {
  const loginRes = await request(app).put('/api/auth').send({
    email: testUser.email,
    password: 'wrongpassword'
  });
  expect(loginRes.status).toBe(404);
});

test('login with non-existent user', async () => {
  const loginRes = await request(app).put('/api/auth').send({
    email: 'nonexistent@test.com',
    password: 'password'
  });
  expect(loginRes.status).toBe(404);
});

test('logout', async () => {
  const logoutRes = await request(app)
    .delete('/api/auth')
    .set('Authorization', `Bearer ${testUserAuthToken}`);
  expect(logoutRes.status).toBe(200);
  expect(logoutRes.body.message).toBe('logout successful');
});

test('logout without token', async () => {
  const logoutRes = await request(app).delete('/api/auth');
  expect(logoutRes.status).toBe(401);
  expect(logoutRes.body.message).toBe('unauthorized');
});

test('logout with invalid token', async () => {
  const logoutRes = await request(app)
    .delete('/api/auth')
    .set('Authorization', 'Bearer invalid.token.here');
  expect(logoutRes.status).toBe(401);
  expect(logoutRes.body.message).toBe('unauthorized');
});

function expectValidJwt(potentialJwt) {
  expect(potentialJwt).toMatch(/^[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*$/);
}