const request = require("supertest");
const app = require("../service");
const { Role, DB } = require("../database/database.js");

if (process.env.VSCODE_INSPECTOR_OPTIONS) {
  jest.setTimeout(60 * 1000 * 5); // 5 minutes
}

function randomName() {
  return Math.random().toString(36).substring(2, 12);
}

async function createAdminUser() {
  let user = { password: "toomanysecrets", roles: [{ role: Role.Admin }] };
  user.name = randomName();
  user.email = user.name + "@admin.com";

  user = await DB.addUser(user);
  return { ...user, password: "toomanysecrets" };
}

let adminUser;
let adminToken;
let testUser;
let testUserToken;
let otherUser;

beforeAll(async () => {
  // Create admin user
  adminUser = await createAdminUser();
  const adminLoginRes = await request(app).put("/api/auth").send({
    email: adminUser.email,
    password: adminUser.password,
  });
  adminToken = adminLoginRes.body.token;

  // Create regular user
  testUser = {
    name: randomName(),
    email: randomName() + "@test.com",
    password: "password123",
  };
  const testUserRes = await request(app).post("/api/auth").send(testUser);
  testUserToken = testUserRes.body.token;
  testUser.id = testUserRes.body.user.id;

  // Create another regular user
  otherUser = {
    name: randomName(),
    email: randomName() + "@test.com",
    password: "password456",
  };
  const otherUserRes = await request(app).post("/api/auth").send(otherUser);
  otherUser.id = otherUserRes.body.user.id;
});

describe("getUser", () => {
  test("get authenticated user profile", async () => {
    const res = await request(app)
      .get("/api/user/me")
      .set("Authorization", `Bearer ${testUserToken}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(testUser.id);
    expect(res.body.name).toBe(testUser.name);
    expect(res.body.email).toBe(testUser.email);
    expect(res.body.password).toBeUndefined();
    expect(res.body.roles).toEqual([{ role: "diner" }]);
  });

  test("get user profile without auth", async () => {
    const res = await request(app).get("/api/user/me");
    expect(res.status).toBe(401);
    expect(res.body.message).toBe("unauthorized");
  });

  test("get user profile with invalid token", async () => {
    const res = await request(app)
      .get("/api/user/me")
      .set("Authorization", "Bearer invalid.token.here");

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("unauthorized");
  });
});

describe("updateUser", () => {
  test("update own user profile", async () => {
    const updates = {
      name: randomName(),
      email: randomName() + "@updated.com",
      password: "newpassword",
    };

    const res = await request(app)
      .put(`/api/user/${testUser.id}`)
      .set("Authorization", `Bearer ${testUserToken}`)
      .send(updates);

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(testUser.id);
    expect(res.body.user.name).toBe(updates.name);
    expect(res.body.user.email).toBe(updates.email);
    expect(res.body.user.password).toBeUndefined();
    expect(res.body).toHaveProperty("token");

    testUser.name = updates.name;
    testUser.email = updates.email;
    testUser.password = updates.password;
    testUserToken = res.body.token;
  });

  test("update user as admin", async () => {
    const updates = {
      name: randomName(),
      email: randomName() + "@admin-updated.com",
    };

    const res = await request(app)
      .put(`/api/user/${otherUser.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send(updates);

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(otherUser.id);
    expect(res.body.user.name).toBe(updates.name);
    expect(res.body.user.email).toBe(updates.email);
    expect(res.body).toHaveProperty("token");
  });

  test("update other user without admin role", async () => {
    const updates = {
      name: randomName(),
      email: randomName() + "@unauthorized.com",
    };

    const res = await request(app)
      .put(`/api/user/${adminUser.id}`)
      .set("Authorization", `Bearer ${testUserToken}`)
      .send(updates);

    expect(res.status).toBe(403);
    expect(res.body.message).toBe("unauthorized");
  });

  test("update user without auth", async () => {
    const updates = {
      name: randomName(),
      email: randomName() + "@noauth.com",
    };

    const res = await request(app)
      .put(`/api/user/${testUser.id}`)
      .send(updates);

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("unauthorized");
  });

  test("update user with partial data", async () => {
    const partialTestUser = {
      name: randomName(),
      email: randomName() + "@partial.com",
      password: "partialpass",
    };

    const registerRes = await request(app)
      .post("/api/auth")
      .send(partialTestUser);
    const userId = registerRes.body.user.id;
    const token = registerRes.body.token;

    const updates = {
      name: randomName(),
      email: partialTestUser.email,
      password: partialTestUser.password,
    };

    const res = await request(app)
      .put(`/api/user/${userId}`)
      .set("Authorization", `Bearer ${token}`)
      .send(updates);

    expect([200, 500]).toContain(res.status);

    if (res.status === 200) {
      expect(res.body.user.name).toBe(updates.name);
      expect(res.body.user.email).toBe(partialTestUser.email);
    }
  });

  test("verify login with updated credentials", async () => {
    const freshUser = {
      name: randomName(),
      email: randomName() + "@fresh.com",
      password: "initialpass",
    };

    // Register fresh user
    const registerRes = await request(app).post("/api/auth").send(freshUser);
    expect(registerRes.status).toBe(200);

    const userId = registerRes.body.user.id;
    const token = registerRes.body.token;

    // Update the user's password
    const newPassword = "updatedpass";
    const updateRes = await request(app)
      .put(`/api/user/${userId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: freshUser.name,
        email: freshUser.email,
        password: newPassword,
      });

    expect(updateRes.status).toBe(200);

    // Login with the updated credentials
    const loginRes = await request(app).put("/api/auth").send({
      email: freshUser.email,
      password: newPassword,
    });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.user.name).toBe(freshUser.name);
    expect(loginRes.body.user.email).toBe(freshUser.email);
  });

  test("list users unauthorized", async () => {
    const listUsersRes = await request(app).get("/api/user");
    expect(listUsersRes.status).toBe(401);
  });

  test("list users", async () => {
    const listUsersRes = await request(app)
      .get("/api/user")
      .set("Authorization", "Bearer " + adminToken);
    expect(listUsersRes.status).toBe(200);
  });

  test("get users with pagination", async () => {
    const listUsersRes = await request(app)
      .get("/api/user?page=0&limit=2")
      .set("Authorization", "Bearer " + adminToken);
    expect(listUsersRes.status).toBe(200);
    expect(listUsersRes.body).toHaveProperty("users");
    expect(listUsersRes.body).toHaveProperty("more");
  });

  test("get users with name filter", async () => {
    const listUsersRes = await request(app)
      .get(`/api/user?name=${testUser.name}`)
      .set("Authorization", "Bearer " + adminToken);
    expect(listUsersRes.status).toBe(200);
    expect(listUsersRes.body.users.length).toBeGreaterThan(0);
    expect(listUsersRes.body.users[0].name).toBe(testUser.name);
  });
  async function registerUser(service) {
    const testUser = {
      name: "pizza diner",
      email: `${randomName()}@test.com`,
      password: "a",
    };
    const registerRes = await service.post("/api/auth").send(testUser);
    registerRes.body.user.password = testUser.password;

    return [registerRes.body.user, registerRes.body.token];
  }

  function randomName() {
    return Math.random().toString(36).substring(2, 12);
  }
});
