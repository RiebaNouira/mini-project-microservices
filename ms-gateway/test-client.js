const fetch = globalThis.fetch;

if (!fetch) {
  console.error('This test requires Node.js with fetch support (Node 18+).');
  process.exit(1);
}

const BASE = 'http://localhost:3000';

async function go() {
  const userResponse = await fetch(`${BASE}/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'karim' }),
  });
  const user = await userResponse.json();
  console.log('Created user:', user);

  const postResponse = await fetch(`${BASE}/posts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: user.id, text: 'Test de contenu.' }),
  });
  const post = await postResponse.json();
  console.log('Created post:', post);

  const moderationResponse = await fetch(`${BASE}/posts/${post.id}/moderation`);
  const moderation = await moderationResponse.json();
  console.log('Moderation report:', moderation);
}

go().catch((err) => {
  console.error(err);
  process.exit(1);
});
