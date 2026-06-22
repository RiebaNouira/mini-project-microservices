const path = require('path');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const { v4: uuidv4 } = require('uuid');

const db = require('./db');
const kafka = require('./kafka');

const PROTO_PATH = path.join(__dirname, '..', 'proto', 'content.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: false,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const contentProto = grpc.loadPackageDefinition(packageDefinition).content;
const ALLOWED_STATUSES = ['PENDING', 'APPROUVE', 'REJETE'];

async function createPost(call, callback) {
  try {
    const { userId, text } = call.request;
    if (!userId || !userId.trim() || !text || !text.trim()) {
      return callback({ code: grpc.status.INVALID_ARGUMENT, message: 'userId and text are required' });
    }

    const restriction = await db.getRestrictionStatus(userId);
    if (restriction?.restricted) {
      return callback({ code: grpc.status.PERMISSION_DENIED, message: 'user is blocked from posting' });
    }

    const post = {
      id: uuidv4(),
      userId,
      text,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    };

    await db.insertPost(post);
    await kafka.publish('content.submitted', {
      postId: post.id,
      userId: post.userId,
      text: post.text,
      createdAt: post.createdAt,
    });

    callback(null, post);
  } catch (err) {
    callback({ code: grpc.status.INTERNAL, message: err.message });
  }
}

async function getPost(call, callback) {
  try {
    const { id } = call.request;
    const post = await db.getPostById(id);
    if (!post) {
      return callback({ code: grpc.status.NOT_FOUND, message: `post not found with id "${id}"` });
    }
    callback(null, post);
  } catch (err) {
    callback({ code: grpc.status.INTERNAL, message: err.message });
  }
}

async function listPosts(call, callback) {
  try {
    const { statusFilter } = call.request;
    const posts = await db.listPosts(statusFilter || null);
    callback(null, { posts });
  } catch (err) {
    callback({ code: grpc.status.INTERNAL, message: err.message });
  }
}

async function updatePostStatus(call, callback) {
  try {
    const { id, status } = call.request;
    if (!id || !status || !ALLOWED_STATUSES.includes(status)) {
      return callback({ code: grpc.status.INVALID_ARGUMENT, message: `status must be one of: ${ALLOWED_STATUSES.join(', ')}` });
    }

    const updated = await db.updatePostStatus(id, status);
    if (!updated) {
      return callback({ code: grpc.status.NOT_FOUND, message: `post not found with id "${id}"` });
    }

    callback(null, updated);
  } catch (err) {
    callback({ code: grpc.status.INTERNAL, message: err.message });
  }
}

async function canUserPost(call, callback) {
  try {
    const { userId } = call.request;
    if (!userId || !userId.trim()) {
      return callback({ code: grpc.status.INVALID_ARGUMENT, message: 'userId is required' });
    }

    const restriction = await db.getRestrictionStatus(userId);
    const allowed = !restriction?.restricted;
    callback(null, { allowed, reason: allowed ? 'user is allowed to post' : 'user is blocked due to reputation' });
  } catch (err) {
    callback({ code: grpc.status.INTERNAL, message: err.message });
  }
}

async function handleKafkaMessage(topic, payload) {
  if (!payload || !payload.postId) return;

  if (topic === 'content.approved') {
    await db.updatePostStatus(payload.postId, 'APPROUVE');
    console.log(`ms-content updated post ${payload.postId} → APPROUVE`);
  } else if (topic === 'content.flagged') {
    await db.updatePostStatus(payload.postId, 'REJETE');
    console.log(`ms-content updated post ${payload.postId} → REJETE`);
  } else if (topic === 'user.restricted') {
    await db.setUserRestriction({
      userId: payload.userId,
      restricted: true,
      updatedAt: payload.createdAt || new Date().toISOString(),
    });
    console.log(`ms-content received user.restricted for ${payload.userId}`);
  }
}

async function startKafkaConsumers() {
  await kafka.createConsumer('group-content-updater', ['content.approved', 'content.flagged', 'user.restricted'], handleKafkaMessage);
}

function main() {
  const server = new grpc.Server();
  server.addService(contentProto.ContentService.service, {
    CreatePost: createPost,
    GetPost: getPost,
    ListPosts: listPosts,
    UpdatePostStatus: updatePostStatus,
    CanUserPost: canUserPost,
  });

  const port = process.env.PORT || 50051;
  server.bindAsync(`0.0.0.0:${port}`, grpc.ServerCredentials.createInsecure(), (err, boundPort) => {
    if (err) {
      console.error('ms-content failed to bind:', err);
      process.exit(1);
    }
    server.start();
    console.log(`ms-content gRPC server listening on port ${boundPort}`);
    startKafkaConsumers().catch((err) => {
      console.error('ms-content Kafka consumer startup failed:', err.message);
    });
  });
}

main();
