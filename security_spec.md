# Security Specification - TutorNode feedback

## Data Invariants
- A feedback must have a topic, quality_score, and relevance_score.
- Scores must be integers between 1 and 5.
- Timestamps must be equal to request.time on creation.
- Once created, a feedback is immutable.

## The "Dirty Dozen" Payloads (Deny cases)
1.  **Missing required fields**: `{ topic: "History" }` (Missing scores)
2.  **Invalid types**: `{ topic: "History", quality_score: "high" }` (Score must be number)
3.  **Out of range scores**: `{ topic: "History", quality_score: 6 }` (Score > 5)
4.  **String injection**: `{ topic: "A".repeat(1000) }` (Topic too long)
5.  **Shadow update**: `{ ...valid, isVerified: true }` (Unknown field)
6.  **Identity spoofing**: `{ ...valid, userId: "someone-else" }` (If userId is provided and doesn't match)
7.  **Timestamp spoofing**: `{ ...valid, timestamp: "2020-01-01T00:00:00Z" }` (Not server time)
8.  **Update attempt**: Trying to update an existing feedback.
9.  **Delete attempt**: Trying to delete an existing feedback.
10. **Query scraping**: `allow list: if true` (Without filtering)
11. **ID Poisoning**: Creating a feedback with a 2KB document ID.
12. **Blanket read**: Reading all feedbacks without being an admin.

## Test Runner (Logic verification)
Tests will be implemented in `firestore.rules.test.ts`.
