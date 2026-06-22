const path = require('path');
const express = require('express');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const { graphqlHTTP } = require('express-graphql');
const { buildSchema } = require('graphql');

function loadProto(protoFile) {
  const protoPath = path.join(__dirname, '..', 'proto', protoFile);
  const packageDefinition = protoLoader.loadSync(protoPath, {
    keepCase: false,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  });
  return grpc.loadPackageDefinition(packageDefinition);
}

const contentProto = loadProto('content.proto').content;
const moderationProto = loadProto('moderation.proto').moderation;
const reputationProto = loadProto('reputation.proto').reputation;

const contentClient = new contentProto.ContentService('localhost:50051', grpc.credentials.createInsecure());
const moderationClient = new moderationProto.ModerationService('localhost:50052', grpc.credentials.createInsecure());
const reputationClient = new reputationProto.ReputationService('localhost:50053', grpc.credentials.createInsecure());

function grpcCall(client, method, payload) {
  return new Promise((resolve, reject) => {
    client[method](payload, (err, response) => (err ? reject(err) : resolve(response)));
  });
}

const schema = buildSchema(`
  type User {
    id: String
    username: String
    reputationScore: Int
    restricted: Boolean
    createdAt: String
  }

  type Post {
    id: String
    userId: String
    text: String
    status: String
    createdAt: String
  }

  type ModerationReport {
    postId: String
    decision: String
    reason: String
    toxicityScore: Int
    createdAt: String
  }

  type CanPostResult {
    userId: String
    canPost: Boolean
  }

  type UserList {
    users: [User]
  }

  type PostList {
    posts: [Post]
  }

  type Query {
    user(userId: String!): User
    users: UserList
    post(id: String!): Post
    posts(status: String): PostList
    moderationReport(postId: String!): ModerationReport
    canPost(userId: String!): CanPostResult
  }

  type Mutation {
    createUser(username: String!): User
    createPost(userId: String!, text: String!): Post
  }
`);

const rootValue = {
  user: async ({ userId }) => grpcCall(reputationClient, 'GetUser', { userId }),
  users: async () => grpcCall(reputationClient, 'ListUsers', {}),
  post: async ({ id }) => grpcCall(contentClient, 'GetPost', { id }),
  posts: async ({ status }) => grpcCall(contentClient, 'ListPosts', { statusFilter: status || '' }),
  moderationReport: async ({ postId }) => grpcCall(moderationClient, 'GetModerationReport', { postId }),
  canPost: async ({ userId }) => grpcCall(contentClient, 'CanUserPost', { userId }),
  createUser: async ({ username }) => grpcCall(reputationClient, 'CreateUser', { username }),
  createPost: async ({ userId, text }) => grpcCall(contentClient, 'CreatePost', { userId, text }),
};

const app = express();
app.use(express.json());
app.use('/graphql', graphqlHTTP({ schema, rootValue, graphiql: true }));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.post('/users', async (req, res) => {
  try {
    const { username } = req.body;
    const result = await grpcCall(reputationClient, 'CreateUser', { username });
    res.status(201).json(result);
  } catch (err) {
    res.status(err.code === grpc.status.ALREADY_EXISTS ? 409 : 400).json({ error: err.message });
  }
});

app.get('/users', async (req, res) => {
  try {
    const result = await grpcCall(reputationClient, 'ListUsers', {});
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/users/:userId', async (req, res) => {
  try {
    const result = await grpcCall(reputationClient, 'GetUser', { userId: req.params.userId });
    res.json(result);
  } catch (err) {
    res.status(err.code === grpc.status.NOT_FOUND ? 404 : 500).json({ error: err.message });
  }
});

app.post('/posts', async (req, res) => {
  try {
    const { userId, text } = req.body;
    const result = await grpcCall(contentClient, 'CreatePost', { userId, text });
    res.status(201).json(result);
  } catch (err) {
    res.status(err.code === grpc.status.PERMISSION_DENIED ? 403 : 400).json({ error: err.message });
  }
});

app.get('/posts', async (req, res) => {
  try {
    const statusFilter = req.query.status || '';
    const result = await grpcCall(contentClient, 'ListPosts', { statusFilter });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/posts/:id', async (req, res) => {
  try {
    const result = await grpcCall(contentClient, 'GetPost', { id: req.params.id });
    res.json(result);
  } catch (err) {
    res.status(err.code === grpc.status.NOT_FOUND ? 404 : 500).json({ error: err.message });
  }
});

app.get('/posts/:id/moderation', async (req, res) => {
  try {
    const result = await grpcCall(moderationClient, 'GetModerationReport', { postId: req.params.id });
    res.json(result);
  } catch (err) {
    res.status(err.code === grpc.status.NOT_FOUND ? 404 : 500).json({ error: err.message });
  }
});

app.get('/users/:userId/can-post', async (req, res) => {
  try {
    const result = await grpcCall(contentClient, 'CanUserPost', { userId: req.params.userId });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`ms-gateway HTTP server listening on port ${PORT}`);
});
