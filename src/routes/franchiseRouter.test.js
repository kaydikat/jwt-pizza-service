const request = require('supertest');
const app = require('../service');
const { Role, DB } = require('../database/database.js');

if (process.env.VSCODE_INSPECTOR_OPTIONS) {
  jest.setTimeout(60 * 1000 * 5); // 5 minutes
}

function randomName() {
  return Math.random().toString(36).substring(2, 12);
}

async function createAdminUser() {
  let user = { password: 'toomanysecrets', roles: [{ role: Role.Admin }] };
  user.name = randomName();
  user.email = user.name + '@admin.com';

  user = await DB.addUser(user);
  return { ...user, password: 'toomanysecrets' };
}

let adminUser;
let adminToken;
let testUser;
let testUserToken;
let franchiseeUser;
let franchiseeToken;

beforeAll(async () => {
  // create admin
  adminUser = await createAdminUser();
  const adminLoginRes = await request(app).put('/api/auth').send({
    email: adminUser.email,
    password: adminUser.password
  });
  adminToken = adminLoginRes.body.token;

  // Create user
  testUser = {
    name: randomName(),
    email: randomName() + '@test.com',
    password: 'password123'
  };
  const testUserRes = await request(app).post('/api/auth').send(testUser);
  testUserToken = testUserRes.body.token;

  // Create franchisee user
  franchiseeUser = {
    name: randomName(),
    email: randomName() + '@franchisee.com',
    password: 'password123'
  };
  const franchiseeRes = await request(app).post('/api/auth').send(franchiseeUser);
  franchiseeToken = franchiseeRes.body.token;
});

describe('getFranchises', () => {
  test('get all franchises without auth', async () => {
    const res = await request(app).get('/api/franchise');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('franchises');
    expect(res.body).toHaveProperty('more');
    expect(Array.isArray(res.body.franchises)).toBe(true);
  });

  test('get franchises with pagination', async () => {
    const res = await request(app).get('/api/franchise?page=0&limit=1');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('franchises');
    expect(res.body).toHaveProperty('more');
  });

  test('get franchises with name filter', async () => {
    const res = await request(app).get('/api/franchise?name=nonexistent');
    expect(res.status).toBe(200);
    expect(res.body.franchises).toEqual([]);
  });
});

describe('getUserFranchises', () => {
  test('get user franchises as admin', async () => {
    const res = await request(app)
      .get(`/api/franchise/${testUser.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('get own franchises', async () => {
    const res = await request(app)
      .get(`/api/franchise/${testUser.id}`)
      .set('Authorization', `Bearer ${testUserToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('get other user franchises without admin role', async () => {
    const res = await request(app)
      .get(`/api/franchise/${adminUser.id}`)
      .set('Authorization', `Bearer ${testUserToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('createFranchise', () => {
  test('create franchise as admin', async () => {
    const franchise = {
      name: randomName(),
      admins: [{ email: franchiseeUser.email }]
    };

    const res = await request(app)
      .post('/api/franchise')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(franchise);
    
    expect(res.status).toBe(200);
    expect(res.body.name).toBe(franchise.name);
    expect(res.body).toHaveProperty('id');
    expect(res.body.admins).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ email: franchiseeUser.email })
      ])
    );
  });

  test('create franchise without admin role', async () => {
    const franchise = {
      name: randomName(),
      admins: [{ email: testUser.email }]
    };

    const res = await request(app)
      .post('/api/franchise')
      .set('Authorization', `Bearer ${testUserToken}`)
      .send(franchise);
    
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('unable to create a franchise');
  });

  test('create franchise without auth', async () => {
    const franchise = {
      name: randomName(),
      admins: [{ email: testUser.email }]
    };

    const res = await request(app)
      .post('/api/franchise')
      .send(franchise);
    
    expect(res.status).toBe(401);
  });
});

describe('deleteFranchise', () => {
  let franchiseToDelete;

  beforeEach(async () => {
    // Create a franchise to delete
    const franchise = {
      name: randomName(),
      admins: [{ email: franchiseeUser.email }]
    };

    const createRes = await request(app)
      .post('/api/franchise')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(franchise);
    
    franchiseToDelete = createRes.body;
  });

  test('delete franchise', async () => {
    const res = await request(app)
      .delete(`/api/franchise/${franchiseToDelete.id}`);
    
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('franchise deleted');
  });
});

describe('createStore', () => {
  let testFranchise;

  beforeEach(async () => {
    // Create a franchise for testing
    const franchise = {
      name: randomName(),
      admins: [{ email: franchiseeUser.email }]
    };

    const createRes = await request(app)
      .post('/api/franchise')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(franchise);
    
    testFranchise = createRes.body;
  });

  test('create store as admin', async () => {
    const store = { name: randomName() };

    const res = await request(app)
      .post(`/api/franchise/${testFranchise.id}/store`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(store);
    
    expect(res.status).toBe(200);
    expect(res.body.name).toBe(store.name);
    expect(res.body.franchiseId).toBe(testFranchise.id);
    expect(res.body).toHaveProperty('id');
  });

  test('create store as franchisee', async () => {
    const store = { name: randomName() };

    const res = await request(app)
      .post(`/api/franchise/${testFranchise.id}/store`)
      .set('Authorization', `Bearer ${franchiseeToken}`)
      .send(store);
    
    expect(res.status).toBe(200);
    expect(res.body.name).toBe(store.name);
  });

  test('create store without permission', async () => {
    const store = { name: randomName() };

    const res = await request(app)
      .post(`/api/franchise/${testFranchise.id}/store`)
      .set('Authorization', `Bearer ${testUserToken}`)
      .send(store);
    
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('unable to create a store');
  });
});

describe('deleteStore', () => {
  let testFranchise;
  let testStore;

  beforeEach(async () => {
    // Create a franchise for testing
    const franchise = {
      name: randomName(),
      admins: [{ email: franchiseeUser.email }]
    };

    const createFranchiseRes = await request(app)
      .post('/api/franchise')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(franchise);
    
    testFranchise = createFranchiseRes.body;

    // Create a store to delete
    const store = { name: randomName() };
    const createStoreRes = await request(app)
      .post(`/api/franchise/${testFranchise.id}/store`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(store);
    
    testStore = createStoreRes.body;
  });

  test('delete store as admin', async () => {
    const res = await request(app)
      .delete(`/api/franchise/${testFranchise.id}/store/${testStore.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('store deleted');
  });

  test('delete store as franchisee', async () => {
    const res = await request(app)
      .delete(`/api/franchise/${testFranchise.id}/store/${testStore.id}`)
      .set('Authorization', `Bearer ${franchiseeToken}`);
    
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('store deleted');
  });

  test('delete store without permission', async () => {
    const res = await request(app)
      .delete(`/api/franchise/${testFranchise.id}/store/${testStore.id}`)
      .set('Authorization', `Bearer ${testUserToken}`);
    
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('unable to delete a store');
  });
});