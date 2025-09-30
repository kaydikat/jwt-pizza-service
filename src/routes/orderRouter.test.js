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
let testFranchise;
let testStore;

beforeAll(async () => {
  // Create admin user
  adminUser = await createAdminUser();
  const adminLoginRes = await request(app).put('/api/auth').send({
    email: adminUser.email,
    password: adminUser.password
  });
  adminToken = adminLoginRes.body.token;

  // Create regular user
  testUser = {
    name: randomName(),
    email: randomName() + '@test.com',
    password: 'password123'
  };
  const testUserRes = await request(app).post('/api/auth').send(testUser);
  testUserToken = testUserRes.body.token;
  testUser.id = testUserRes.body.user.id;

  // Create a franchise and store for testing orders
  const franchise = {
    name: randomName(),
    admins: [{ email: adminUser.email }]
  };

  const createFranchiseRes = await request(app)
    .post('/api/franchise')
    .set('Authorization', `Bearer ${adminToken}`)
    .send(franchise);
  
  testFranchise = createFranchiseRes.body;

  // Create a store
  const store = { name: randomName() };
  const createStoreRes = await request(app)
    .post(`/api/franchise/${testFranchise.id}/store`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send(store);
  
  testStore = createStoreRes.body;
});

describe('getMenu', () => {
  test('get menu without auth', async () => {
    const res = await request(app).get('/api/order/menu');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('addMenuItem', () => {
  test('add menu item as admin', async () => {
    const menuItem = {
      title: randomName(),
      description: 'A delicious test pizza',
      image: 'test.png',
      price: 0.01
    };

    const res = await request(app)
      .put('/api/order/menu')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(menuItem);
    
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    
    const newItem = res.body.find(item => item.title === menuItem.title);
    expect(newItem).toBeDefined();
    expect(newItem.description).toBe(menuItem.description);
    expect(newItem.price).toBe(menuItem.price);
  });

  test('add menu item without admin role', async () => {
    const menuItem = {
      title: randomName(),
      description: 'A test pizza',
      image: 'test.png',
      price: 0.01
    };

    const res = await request(app)
      .put('/api/order/menu')
      .set('Authorization', `Bearer ${testUserToken}`)
      .send(menuItem);
    
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('unable to add menu item');
  });
});

describe('getOrders', () => {
  test('get orders with auth', async () => {
    const res = await request(app)
      .get('/api/order')
      .set('Authorization', `Bearer ${testUserToken}`);
    
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('dinerId');
    expect(res.body).toHaveProperty('orders');
    expect(res.body).toHaveProperty('page');
    expect(Array.isArray(res.body.orders)).toBe(true);
    expect(res.body.dinerId).toBe(testUser.id);
  });

  test('get orders with pagination', async () => {
    const res = await request(app)
      .get('/api/order?page=1')
      .set('Authorization', `Bearer ${testUserToken}`);
    
    expect(res.status).toBe(200);
    expect(res.body.page).toBe('1'); // Page comes as string from query param
  });

  test('get orders without auth', async () => {
    const res = await request(app).get('/api/order');
    expect(res.status).toBe(401);
  });
});

describe('createOrder', () => {
  let menuItems;

  beforeAll(async () => {
    // Get menu items for order creation
    const menuRes = await request(app).get('/api/order/menu');
    menuItems = menuRes.body;
    
    // Add a test menu item if none exist
    if (menuItems.length === 0) {
      const menuItem = {
        title: 'Test Pizza',
        description: 'A test pizza for orders',
        image: 'test.png',
        price: 0.01
      };

      await request(app)
        .put('/api/order/menu')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(menuItem);
      
      const updatedMenuRes = await request(app).get('/api/order/menu');
      menuItems = updatedMenuRes.body;
    }
  });

  test('create orde', async () => {
    const orderRequest = {
      franchiseId: testFranchise.id,
      storeId: testStore.id,
      items: [
        {
          menuId: menuItems[0].id,
          description: menuItems[0].description,
          price: menuItems[0].price
        }
      ]
    };

    const res = await request(app)
      .post('/api/order')
      .set('Authorization', `Bearer ${testUserToken}`)
      .send(orderRequest);

    expect([200, 500]).toContain(res.status);
    
    if (res.status === 200) {
      expect(res.body).toHaveProperty('order');
      expect(res.body.order.franchiseId).toBe(testFranchise.id);
      expect(res.body.order.storeId).toBe(testStore.id);
      expect(res.body.order).toHaveProperty('id');
    } else {
      expect(res.body.message).toContain('Failed to fulfill order at factory');
    }
  });
});