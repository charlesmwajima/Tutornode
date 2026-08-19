# Security Specification - OmniTutor

## 1. Data Invariants
- **Lessons**:
  - `userId` must match the authenticated user.
  - `timestamp` must be the server time.
  - `topic`, `whiteboard_notes`, and `teacher_dialogue` must be strings within size limits.
  - Documents are essentially immutable after creation (except maybe metadata, but here we treat lessons as logs).
- **Feedbacks**:
  - `quality_score` and `relevance_score` must be between 1 and 5.
  - `userId` should match the user if authenticated.
  - `timestamp` must be server time.

## 2. The "Dirty Dozen" Payloads (Denial Tests)

### Lessons Collection
1. **Identity Spoofing**: Create lesson with `userId: "attacker_id"`.
2. **Resource Poisoning**: Create lesson with `topic` reaching 1MB.
3. **Temporal Hijack**: Create lesson with `timestamp: "2000-01-01"`.
4. **Unauthorized Read**: `list` or `get` lessons where `resource.data.userId != request.auth.uid`.
5. **Ghost Update**: Update a lesson's `topic` after creation.
6. **Orphan Write**: Write a lesson without a `userId`.

### Feedbacks Collection
7. **Score Overflow**: `quality_score: 10`.
8. **Malicious Link**: Inject JS or huge strings in `comments`.
9. **Identity Theft**: Submit feedback for another user's lesson ID (if linked).
10. **Shadow Field**: Add `isAdmin: true` to a feedback doc.
11. **Bypass Auth**: Create feedback while signed out (if policy requires auth).
12. **Mass Querying**: Attempt to `list` all feedbacks without filtering by my own `userId`.

## 3. Test Runner (Draft)

```typescript
// firestore.rules.test.ts
// This file contains the logic to verify security assertions.
// In a real environment, this runs using @firebase/rules-unit-testing.

describe("OmniTutor Security Rules", () => {
  it("should deny unauthenticated reads for lessons", async () => {
    // ... test logic ...
  });

  it("should deny setting another user's ID for lessons", async () => {
    // ... test logic ...
  });

  it("should enforce score range for feedback", async () => {
    // ... test logic ...
  });
});
```
