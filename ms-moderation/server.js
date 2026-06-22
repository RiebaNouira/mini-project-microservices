const path = require('path');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const { v4: uuidv4 } = require('uuid');

const db = require('./db');
const kafka = require('./kafka');
const { evaluate } = require('./rules');

const PROTO_PATH = path.join(__dirname, '..', 'proto', 'moderation.proto');

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: false,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const moderationProto = grpc.loadPackageDefinition(packageDefinition).moderation;

async function getModerationReport(call, callback) {
  try {
    const { postId } = call.request;
    const report = await db.getLatestReportByPostId(postId);

    if (!report) {
      return callback({
        code: grpc.status.NOT_FOUND,
        message: `no moderation report found for postId "${postId}"`,
      });
    }

    callback(null, report);
  } catch (err) {
    callback({ code: grpc.status.INTERNAL, message: err.message });
  }
}

async function handleSubmittedMessage(topic, payload) {
  if (!payload || !payload.postId || !payload.userId || typeof payload.text !== 'string') return;

  const verdict = evaluate(payload.text);
  const log = {
    id: uuidv4(),
    postId: payload.postId,
    userId: payload.userId,
    decision: verdict.decision,
    reason: verdict.reason,
    toxicityScore: verdict.toxicityScore,
    createdAt: new Date().toISOString(),
  };

  await db.insertLog(log);

  if (verdict.decision === 'APPROUVE') {
    await kafka.publish('content.approved', {
      postId: log.postId,
      userId: log.userId,
      createdAt: log.createdAt,
    });
    console.log(`Published content.approved for post ${log.postId}`);
  } else {
    await kafka.publish('content.flagged', {
      postId: log.postId,
      userId: log.userId,
      reason: log.reason,
      toxicityScore: log.toxicityScore,
      createdAt: log.createdAt,
    });
    console.log(`Published content.flagged for post ${log.postId}`);
  }
}

async function startKafkaConsumer() {
  await kafka.createConsumer('group-moderation', ['content.submitted'], handleSubmittedMessage);
}

function main() {
  const server = new grpc.Server();

  server.addService(moderationProto.ModerationService.service, {
    GetModerationReport: getModerationReport,
  });

  const PORT = process.env.PORT || 50052;
  server.bindAsync(`0.0.0.0:${PORT}`, grpc.ServerCredentials.createInsecure(), (err, port) => {
    if (err) {
      console.error('Failed to bind server:', err);
      return;
    }

    server.start();
    console.log(`ms-moderation gRPC server listening on port ${port}`);
    startKafkaConsumer().catch((consumerErr) => {
      console.error('ms-moderation Kafka startup failed:', consumerErr.message);
    });
  });
}

main();
