const path = require('path');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

const db = require('./db');

const PROTO_PATH = path.join(__dirname, '..', 'proto', 'moderation.proto');

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: false,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const moderationProto = grpc.loadPackageDefinition(packageDefinition).moderation;

// This is the ONLY gRPC method ms-moderation exposes, per the spec note:
// moderation itself is triggered by Kafka (content.submitted), not by a
// direct client call. GetModerationReport is purely a read — "what did you
// decide about this post?" — used later by the Gateway's
// `GET /posts/:id/moderation` route.
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
    console.log(`ms-moderation gRPC server listening on port ${port}`);
  });
}

main();