const path = require('path');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const { v4: uuidv4 } = require('uuid');

const db = require('./db');

const PROTO_PATH = path.join(__dirname, '..', 'proto', 'reputation.proto');

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: false,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const reputationProto = grpc.loadPackageDefinition(packageDefinition).reputation;

// --- RPC implementations ---
// grpc-js handlers have the signature (call, callback). We mark them `async`
// so we can `await` the (now promise-based) db.js calls, and wrap the body
// in try/catch to translate JS errors into proper gRPC status codes.

async function createUser(call, callback) {
  try {
    const { username } = call.request;

    if (!username || username.trim().length === 0) {
      return callback({ code: grpc.status.INVALID_ARGUMENT, message: 'username is required' });
    }

    const existing = await db.getUserByUsername(username);
    if (existing) {
      return callback({ code: grpc.status.ALREADY_EXISTS, message: `username "${username}" is already taken` });
    }

    const newUser = {
      id: uuidv4(),
      username,
      reputationScore: 100, // everyone starts trusted, per the spec
      restricted: false,
      createdAt: new Date().toISOString(),
    };

    const created = await db.insertUser(newUser);
    callback(null, created);
  } catch (err) {
    callback({ code: grpc.status.INTERNAL, message: err.message });
  }
}

async function getUser(call, callback) {
  try {
    const { userId } = call.request;
    const user = await db.getUserById(userId);

    if (!user) {
      return callback({ code: grpc.status.NOT_FOUND, message: `no user found with id "${userId}"` });
    }

    callback(null, user);
  } catch (err) {
    callback({ code: grpc.status.INTERNAL, message: err.message });
  }
}

async function listUsers(call, callback) {
  try {
    const users = await db.listUsers();
    callback(null, { users });
  } catch (err) {
    callback({ code: grpc.status.INTERNAL, message: err.message });
  }
}

function main() {
  const server = new grpc.Server();

  server.addService(reputationProto.ReputationService.service, {
    CreateUser: createUser,
    GetUser: getUser,
    ListUsers: listUsers,
  });

  const PORT = process.env.PORT || 50053;
  server.bindAsync(`0.0.0.0:${PORT}`, grpc.ServerCredentials.createInsecure(), (err, port) => {
    if (err) {
      console.error('Failed to bind server:', err);
      return;
    }
    console.log(`ms-reputation gRPC server listening on port ${port}`);
  });
}

main();