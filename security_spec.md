# TutorNode Security Specification

## 1. Data Invariants
1. **Identity Ownership**: Every user-owned document (`feedbacks`, `lessons`, `syllabi`, `exams`, `quizAttempts`, `documents`, `tutorThreads`, `videoJobs`) MUST carry `userId == request.auth.uid` on creation and may never transfer `userId` on update.
2. **Verified Admin Gate**: Administrator privileges apply exclusively when `request.auth != null`, `request.auth.token.email == 'charlesmwajima@gmail.com'`, AND `request.auth.token.email_verified == true`.
3. **No Unauthenticated Reads or Open List Scraping**: Zero collections permit unauthenticated reads (`get` or `list`). Every `allow list` explicitly checks `resource.data.userId == request.auth.uid || isAdmin()`.
4. **Strict Field Allowlisting (`hasOnly`) & Size Bounds**: Every document enforces `hasAll` + `hasOnly` and string/list `.size()` limits (capped well below Firestore's 1MB document limit).
5. **Server-Time Integrity**: Firestore timestamps (`timestamp`, `createdAt`, `updatedAt`) enforce `== request.time` on creation/mutation.

## 2. Adversarial "Dirty Dozen" Payloads (Must Return PERMISSION_DENIED)
1. Unauthenticated `get` on `/syllabi/anyId` or `/exams/anyId`.
2. Signed-in non-owner `list` on `/syllabi` or `/exams` without `where('userId', '==', uid)`.
3. Non-admin spoofing `email: 'charlesmwajima@gmail.com'` with `email_verified: false` reading `/feedbacks`.
4. Creating `/lessons` with `userId: 'other-uid'` (identity spoofing).
5. Creating `/feedbacks` with shadow field `isVerified: true` (fails `hasOnly`).
6. Creating `/feedbacks` with `quality_score: 99` (outside 1..5 range).
7. Creating `/exams` with 40MB `data` payload (exceeds `<= 850000` rule + 1MB doc limit).
8. Passing oversized 500-char document ID (blocked by `isValidId`).
9. Non-admin updating `/appSettings/videoMode` (blocked by `isAdmin()`).
10. Updating `/tutorThreads` to alter immutable `userId` (blocked by `affectedKeys().hasOnly(['topic', 'messages', 'updatedAt'])`).
11. Backdating `/quizAttempts.createdAt` to past client timestamp (blocked by `== request.time`).
12. Deleting another user's `/documents/{docId}` (blocked by `existing().userId == request.auth.uid`).
