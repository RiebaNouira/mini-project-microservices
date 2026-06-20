const path = require('path');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

const PROTO_PATH = path.join(__dirname, '..', 'proto', 'reputation.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: false,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});
const reputationProto = grpc.loadPackageDefinition(packageDefinition).reputation;

const client = new reputationProto.ReputationService(
  'localhost:50053',
  grpc.credentials.createInsecure()
);

function createUser(username) {
  return new Promise((resolve, reject) => {
    client.CreateUser({ username }, (err, res) => (err ? reject(err) : resolve(res)));
  });
}
function getUser(userId) {
  return new Promise((resolve, reject) => {
    client.GetUser({ userId }, (err, res) => (err ? reject(err) : resolve(res)));
  });
}
function listUsers() {
  return new Promise((resolve, reject) => {
    client.ListUsers({}, (err, res) => (err ? reject(err) : resolve(res)));
  });
}

(async () => {
  console.log('--- CreateUser("karim") ---');
  const karim = await createUser('karim');
  console.log(karim);

  console.log('\n--- GetUser(karim.id) ---');
  console.log(await getUser(karim.id));

  console.log('\n--- ListUsers() ---');
  console.log(await listUsers());

  process.exit(0);
})().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});