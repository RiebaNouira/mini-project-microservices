# Topics Kafka — SocioGuard

| Topic | Producteur | Consommateur(s) | Payload (JSON) |
|---|---|---|---|
| `content.submitted` | ms-content | ms-moderation | `{ postId, userId, text, createdAt }` |
| `content.approved` | ms-moderation | ms-reputation, ms-content | `{ postId, userId, createdAt }` |
| `content.flagged` | ms-moderation | ms-reputation, ms-content | `{ postId, userId, reason, toxicityScore, createdAt }` |
| `user.restricted` | ms-reputation | ms-content | `{ userId, reputationScore, createdAt }` |

## Consumer groups
- `group-moderation` → ms-moderation consomme `content.submitted`
- `group-reputation` → ms-reputation consomme `content.approved`, `content.flagged`
- `group-content-updater` → ms-content consomme `content.approved`, `content.flagged`, `user.restricted`

## Règle anti-boucle
`ms-content` ne republie jamais `content.submitted` lors d'une mise à jour de statut — la mise à jour passe uniquement par `UpdatePostStatus` en interne (déclenché par les consumers), jamais par republication sur le même topic.