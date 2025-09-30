const { Role, DB } = require('./database.js');
const jwt = require('jsonwebtoken');
const config = require('../config.js');

if (process.env.VSCODE_INSPECTOR_OPTIONS) {
  jest.setTimeout(60 * 1000 * 5); // 5 minutes
}

function randomName() {
  return Math.random().toString(36).substring(2, 12);
}

async function createTestUser(roles = [{ role: Role.Diner }]) {
  return {
    name: randomName(),
    email: randomName() + '@test.com',
    password: 'password123',
    roles: roles
  };
}

describe('Database - Menu Functions', () => {
  test('getMenu returns array', async () => {
    const menu = await DB.getMenu();
    expect(Array.isArray(menu)).toBe(true);
  });

  test('addMenuItem adds item to menu', async () => {
    const item = {
      title: randomName(),
      description: 'Test menu item',
      image: 'test.png',
      price: 9.99
    };

    const addedItem = await DB.addMenuItem(item);
    expect(addedItem.title).toBe(item.title);
    expect(addedItem.description).toBe(item.description);
    expect(addedItem.price).toBe(item.price);
    expect(addedItem).toHaveProperty('id');

    // Verify it's in the menu
    const menu = await DB.getMenu();
    const foundItem = menu.find(menuItem => menuItem.id === addedItem.id);
    expect(foundItem).toBeDefined();
  });
});

describe('Database - User Functions', () => {
  let testUser;

  beforeEach(async () => {
    testUser = await createTestUser();
  });

  test('addUser creates user with hashed password', async () => {
    const createdUser = await DB.addUser(testUser);
    
    expect(createdUser.name).toBe(testUser.name);
    expect(createdUser.email).toBe(testUser.email);
    expect(createdUser.password).toBeUndefined();
    expect(createdUser.roles).toEqual(testUser.roles);
    expect(createdUser).toHaveProperty('id');
  });

  test('addUser with multiple roles', async () => {
    const adminUser = await createTestUser([
      { role: Role.Admin },
      { role: Role.Diner }
    ]);
    
    const createdUser = await DB.addUser(adminUser);
    expect(createdUser.roles).toHaveLength(2);
    expect(createdUser.roles).toContainEqual({ role: Role.Admin });
    expect(createdUser.roles).toContainEqual({ role: Role.Diner });
  });

  test('getUser with valid credentials', async () => {
    const createdUser = await DB.addUser(testUser);
    const retrievedUser = await DB.getUser(testUser.email, testUser.password);
    
    expect(retrievedUser.id).toBe(createdUser.id);
    expect(retrievedUser.name).toBe(testUser.name);
    expect(retrievedUser.email).toBe(testUser.email);
    expect(retrievedUser.password).toBeUndefined();
    expect(retrievedUser.roles).toEqual(testUser.roles);
  });

  test('getUser with invalid password', async () => {
    await DB.addUser(testUser);
    await expect(DB.getUser(testUser.email, 'wrongpassword')).rejects.toThrow();
  });

  test('getUser with non-existent email', async () => {
    await expect(DB.getUser('nonexistent@test.com', 'password')).rejects.toThrow();
  });

  test('getUser without password verification', async () => {
    const createdUser = await DB.addUser(testUser);
    const retrievedUser = await DB.getUser(testUser.email);
    
    expect(retrievedUser.id).toBe(createdUser.id);
    expect(retrievedUser.email).toBe(testUser.email);
  });

  test('updateUser', async () => {
    const createdUser = await DB.addUser(testUser);
    const updates = {
      name: randomName(),
      email: randomName() + '@updated.com',
      password: 'newpassword'
    };
    
    const updatedUser = await DB.updateUser(
      createdUser.id, 
      updates.name, 
      updates.email, 
      updates.password
    );
    
    expect(updatedUser.name).toBe(updates.name);
    expect(updatedUser.email).toBe(updates.email);
    expect(updatedUser.password).toBeUndefined();
    
    // Verify we can login with new credentials
    const loginUser = await DB.getUser(updates.email, updates.password);
    expect(loginUser.id).toBe(createdUser.id);
  });
});

describe('Database - Authentication Functions', () => {
  let testUser;
  let token;

  beforeEach(async () => {
    testUser = await createTestUser();
    const createdUser = await DB.addUser(testUser);
    testUser.id = createdUser.id;
    token = jwt.sign(createdUser, config.jwtSecret);
  });

  test('loginUser stores auth token', async () => {
    await DB.loginUser(testUser.id, token);
    const isLoggedIn = await DB.isLoggedIn(token);
    expect(isLoggedIn).toBe(true);
  });

  test('isLoggedIn returns false for invalid token', async () => {
    const isLoggedIn = await DB.isLoggedIn('invalid.token.here');
    expect(isLoggedIn).toBe(false);
  });

  test('logoutUser removes auth token', async () => {
    await DB.loginUser(testUser.id, token);
    expect(await DB.isLoggedIn(token)).toBe(true);
    
    await DB.logoutUser(token);
    expect(await DB.isLoggedIn(token)).toBe(false);
  });
});

describe('Database - Order Functions', () => {
  let testUser;
  let testFranchise;
  let testStore;
  let menuItem;

  beforeEach(async () => {
    // Create test user
    const userData = await createTestUser();
    testUser = await DB.addUser(userData);

    // Create test franchise
    const franchiseData = {
      name: randomName(),
      admins: [{ email: testUser.email, id: testUser.id, name: testUser.name }]
    };
    testFranchise = await DB.createFranchise(franchiseData);

    // Create test store
    testStore = await DB.createStore(testFranchise.id, { name: randomName() });

    // Create test menu item
    menuItem = await DB.addMenuItem({
      title: randomName(),
      description: 'Test pizza',
      image: 'test.png',
      price: 10.00
    });
  });

  test('addDinerOrder creates order', async () => {
    const order = {
      franchiseId: testFranchise.id,
      storeId: testStore.id,
      items: [
        {
          menuId: menuItem.id,
          description: menuItem.description,
          price: menuItem.price
        }
      ]
    };

    const createdOrder = await DB.addDinerOrder(testUser, order);
    expect(createdOrder.franchiseId).toBe(testFranchise.id);
    expect(createdOrder.storeId).toBe(testStore.id);
    expect(createdOrder).toHaveProperty('id');
    expect(createdOrder.items).toEqual(order.items);
  });

  test('getOrders retrieves user orders', async () => {
    // Create an order first
    const order = {
      franchiseId: testFranchise.id,
      storeId: testStore.id,
      items: [
        {
          menuId: menuItem.id,
          description: menuItem.description,
          price: menuItem.price
        }
      ]
    };
    
    await DB.addDinerOrder(testUser, order);

    const orders = await DB.getOrders(testUser);
    expect(orders.dinerId).toBe(testUser.id);
    expect(Array.isArray(orders.orders)).toBe(true);
    expect(orders.orders.length).toBeGreaterThan(0);
    
    const retrievedOrder = orders.orders[0];
    expect(retrievedOrder.franchiseId).toBe(testFranchise.id);
    expect(retrievedOrder.storeId).toBe(testStore.id);
    expect(Array.isArray(retrievedOrder.items)).toBe(true);
  });

  test('getOrders with pagination', async () => {
    const orders = await DB.getOrders(testUser, 2);
    expect(orders.page).toBe(2);
    expect(orders.dinerId).toBe(testUser.id);
  });
});

describe('Database - Franchise Functions', () => {
  let adminUser;
  let franchiseeUser;

  beforeEach(async () => {
    // Create admin user
    const adminData = await createTestUser([{ role: Role.Admin }]);
    adminUser = await DB.addUser(adminData);

    // Create franchisee user
    const franchiseeData = await createTestUser([{ role: Role.Diner }]);
    franchiseeUser = await DB.addUser(franchiseeData);
  });

  test('getUserFranchises returns user franchises', async () => {
    // Create franchise for the user
    const franchiseData = {
      name: randomName(),
      admins: [{ email: franchiseeUser.email }]
    };
    const createdFranchise = await DB.createFranchise(franchiseData);

    const userFranchises = await DB.getUserFranchises(franchiseeUser.id);
    expect(Array.isArray(userFranchises)).toBe(true);
    expect(userFranchises.some(f => f.id === createdFranchise.id)).toBe(true);
  });

  test('getUserFranchises returns empty for user with no franchises', async () => {
    const userFranchises = await DB.getUserFranchises(adminUser.id);
    expect(Array.isArray(userFranchises)).toBe(true);
    expect(userFranchises).toEqual([]);
  });

  test('getFranchise returns detailed franchise info', async () => {
    const franchiseData = {
      name: randomName(),
      admins: [{ email: franchiseeUser.email }]
    };
    const createdFranchise = await DB.createFranchise(franchiseData);

    const franchise = await DB.getFranchise({ id: createdFranchise.id });
    expect(franchise.id).toBe(createdFranchise.id);
    expect(Array.isArray(franchise.admins)).toBe(true);
    expect(Array.isArray(franchise.stores)).toBe(true);
  });

  test('deleteFranchise removes franchise', async () => {
    const franchiseData = {
      name: randomName(),
      admins: [{ email: franchiseeUser.email }]
    };
    const createdFranchise = await DB.createFranchise(franchiseData);

    await DB.deleteFranchise(createdFranchise.id);

    // Verify franchise is deleted by trying to get user franchises
    const userFranchises = await DB.getUserFranchises(franchiseeUser.id);
    expect(userFranchises.some(f => f.id === createdFranchise.id)).toBe(false);
  });
});

describe('Database - Store Functions', () => {
  let testFranchise;
  let franchiseeUser;

  beforeEach(async () => {
    // Create franchisee user
    const userData = await createTestUser([{ role: Role.Diner }]);
    franchiseeUser = await DB.addUser(userData);

    // Create test franchise
    const franchiseData = {
      name: randomName(),
      admins: [{ email: franchiseeUser.email }]
    };
    testFranchise = await DB.createFranchise(franchiseData);
  });

  test('createStore creates store for franchise', async () => {
    const storeData = { name: randomName() };
    const store = await DB.createStore(testFranchise.id, storeData);
    
    expect(store.name).toBe(storeData.name);
    expect(store.franchiseId).toBe(testFranchise.id);
    expect(store).toHaveProperty('id');
  });

  test('deleteStore removes store from franchise', async () => {
    const storeData = { name: randomName() };
    const store = await DB.createStore(testFranchise.id, storeData);
    
    await DB.deleteStore(testFranchise.id, store.id);
    
    // Verify store is deleted by checking franchise stores
    const franchise = await DB.getFranchise({ id: testFranchise.id});
    expect(franchise.stores.some(s => s.id === store.id)).toBe(false);
  });
});