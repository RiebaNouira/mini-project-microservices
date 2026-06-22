const path = require('path');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const { v4: uuidv4 } = require('uuid');

const db = require('./db');
const kafka = require('./kafka');

const PROTO_PATH = path.join(__dirname, '..', 'proto', 'reputation.proto');

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: false,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const reputationProto = grpc.loadPackageDefinition(packageDefinition).reputation;

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
      reputationScore: 100,
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

async function handleKafkaMessage(topic, payload) {
  if (!payload || !payload.userId) return;

  try {
    const user = await db.getUserById(payload.userId);
    if (!user) return;

    if (topic === 'content.flagged') {
      const newScore = Math.max(0, user.reputationScore - 20);
      const restricted = newScore <= 0;
      await db.updateUserReputation({ id: user.id, reputationScore: newScore, restricted });
      await db.insertReputationHistory({
        id: uuidv4(),
        userId: user.id,
        delta: newScore - user.reputationScore,
        reason: `content flagged${payload.reason ? `: ${payload.reason}` : ''}`,
        createdAt: new Date().toISOString(),
      });

      if (restricted) {
        await kafka.publish('user.restricted', {
          userId: user.id,
          reputationScore: newScore,
          createdAt: new Date().toISOString(),
        });
        console.log(`ms-reputation blocked user ${user.id} (score ${newScore})`);
      } else {
        console.log(`ms-reputation decreased score for ${user.id} to ${newScore}`);
      }
    }
  } catch (err) {
    console.error('ms-reputation Kafka handler error:', err.message);
  }
}

async function startKafkaConsumer() {
  await kafka.createConsumer('group-reputation', ['content.approved', 'content.flagged'], handleKafkaMessage);
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

    server.start();
    console.log(`ms-reputation gRPC server listening on port ${port}`);
    startKafkaConsumer().catch((consumerErr) => {
      console.error('ms-reputation Kafka startup failed:', consumerErr.message);
    });
  });
}

main();
