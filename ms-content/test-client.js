const path = require('path');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

const PROTO_PATH = path.join(__dirname, '..', 'proto', 'content.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: false,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const contentProto = grpc.loadPackageDefinition(packageDefinition).content;
const client = new contentProto.ContentService('localhost:50051', grpc.credentials.createInsecure());

function call(method, payload) {
  return new Promise((resolve, reject) => {
    client[method](payload, (err, res) => (err ? reject(err) : resolve(res)));
  });
}

(async () => {
  try {
    console.log('--- CreatePost ---');
    const post = await call('CreatePost', { userId: 'user-karim', text: 'Je teste le nouveau service de contenu.' });
    console.log(post);

    console.log('\n--- GetPost ---');
    console.log(await call('GetPost', { id: post.id }));

    console.log('\n--- ListPosts ---');
    console.log(await call('ListPosts', { statusFilter: 'PENDING' }));

    console.log('\n--- CanUserPost ---');
    console.log(await call('CanUserPost', { userId: 'user-karim' }));
  } catch (err) {
    console.error('Test failed:', err.message || err);
    process.exit(1);
  }
})();
