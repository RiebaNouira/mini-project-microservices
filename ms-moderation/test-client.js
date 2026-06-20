const path = require('path');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

const PROTO_PATH = path.join(__dirname, '..', 'proto', 'moderation.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: false,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});
const moderationProto = grpc.loadPackageDefinition(packageDefinition).moderation;

const client = new moderationProto.ModerationService(
  'localhost:50052',
  grpc.credentials.createInsecure()
);

function getModerationReport(postId) {
  return new Promise((resolve, reject) => {
    client.GetModerationReport({ postId }, (err, res) => (err ? reject(err) : resolve(res)));
  });
}

(async () => {
  console.log('--- GetModerationReport("post-001") (approved post) ---');
  console.log(await getModerationReport('post-001'));

  console.log('\n--- GetModerationReport("post-002") (rejected post) ---');
  console.log(await getModerationReport('post-002'));

  console.log('\n--- GetModerationReport("post-999") (should fail NOT_FOUND) ---');
  try {
    await getModerationReport('post-999');
  } catch (err) {
    console.log(`Got expected error: [${err.code}] ${err.details}`);
  }

  console.log('\nAll checks passed.');
  process.exit(0);
})().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});