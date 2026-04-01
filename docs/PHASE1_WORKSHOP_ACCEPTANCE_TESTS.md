# Phase 1 Acceptance Tests - Workshop Confirmation

هذا الملف يغطي اختبارات القبول الكاملة لـ Phase 1 فقط.
الهدف: التأكد أن "ورشة التأكد" تعمل بالكامل بدون تعارض على مستوى الواجهة والـ API.

## Scope

- بعد الدفع: الدعوة تدخل `in_workshop_review`.
- منع المستخدم من المدعوين قبل `approved` (UI + API).
- منع ظهور Preview للمستخدم قبل `approved`.
- اعتماد الأدمن يفتح المرحلة التالية.
- إرجاع الأدمن للتعديل يوقف التقدم.
- التحقق من البريد الإداري والرابط المباشر.
- التوافق مع الدعوات القديمة (legacy fallback).

## Preconditions

- حساب مستخدم عادي + حساب أدمن.
- إعداد بيئة Firebase و Firestore و Storage.
- (اختياري للإرسال الفعلي للبريد) إعداد:
  - `RESEND_API_KEY`
  - `RESEND_FROM_EMAIL`
  - `ADMIN_EMAILS` أو `NEXT_PUBLIC_ADMIN_EMAILS`
- تشغيل المشروع محليًا.

## Test Data

- مناسبة: `wedding`
- قالب فعال مع إمكانية توليد صورة.
- باقة: `50`
- مستخدم جديد للدعوة الاختبارية.

---

## AC-01: New Invite Enters Workshop After Payment

**Steps**
1. سجّل دخول كمستخدم عادي.
2. أنشئ دعوة جديدة حتى صفحة الدفع.
3. نفّذ الدفع (التدفق الحالي).
4. لاحظ الصفحة التالية بعد الدفع.

**Expected (UI)**
- لا انتقال مباشر إلى صفحة المدعوين.
- الانتقال إلى: `/dashboard/invites/{inviteId}/workshop-status`.
- تظهر الحالة: `in_workshop_review` أو ما يكافئها.

**Expected (DB/API)**
- في وثيقة `invites/{inviteId}`:
  - `paymentStatus = paid`
  - `workflowStatus = in_workshop_review`
  - `reviewStatus = pending`
  - `adminPreviewUrl` موجود وغير فارغ
- تم إنشاء سجل جديد في `invitation_reviews` بفعل `entered_workshop`.

---

## AC-02: User Cannot Access Guests Before Approved (UI + API)

**Steps**
1. باستخدام نفس الدعوة وهي `in_workshop_review`، افتح يدويًا:
   - `/guests?invId={inviteId}`
2. نفّذ استدعاء API مباشرة:
   - `GET /api/user/invitations/{inviteId}/guests`
   - `POST /api/user/invitations/{inviteId}/guests`
   - `PATCH /api/user/invitations/{inviteId}/guests/{guestId}` (إن وجد)
   - `DELETE /api/user/invitations/{inviteId}/guests/{guestId}` (إن وجد)

**Expected (UI)**
- لا تبقى في صفحة المدعوين.
- إعادة توجيه إلى صفحة حالة الورشة.

**Expected (API)**
- جميع عمليات المدعوين قبل الاعتماد ترجع `409`.
- رسالة خطأ تفيد بأن الوصول محجوب حتى الاعتماد.

---

## AC-03: User Cannot See Preview Before Approved

**Steps**
1. بعد الدفع (قبل الاعتماد)، افتح:
   - `/dashboard/invites/{inviteId}`
2. حاول الوصول لتدفق التصميم المرتبط.

**Expected**
- لا يظهر للمستخدم Preview نهائي قابل للاعتماد.
- تظهر رسالة أن الدعوة داخل ورشة التأكد.
- لا يسمح بالتقدم إلى مرحلة المدعوين.

> ملاحظة: `adminPreviewUrl` متاح للأدمن فقط عبر لوحة المراجعة، وليس للمستخدم.

---

## AC-04: Admin Queue and Visual Review Availability

**Steps**
1. سجّل دخول كأدمن.
2. افتح `/admin/invitations/review`.
3. افتح الدعوة من القائمة.

**Expected**
- الدعوة تظهر في Queue بحالة `in_workshop_review`.
- صفحة التفاصيل تعرض:
  - بيانات الطلب
  - بيانات العميل
  - نتائج Alen (مساعد)
  - صورة مرئية من `adminPreviewUrl`

---

## AC-05: Approve Flow Unlocks Next Stage

**Steps**
1. كأدمن، من صفحة مراجعة الدعوة اضغط "اعتماد".
2. كعميل، افتح صفحة حالة الورشة.
3. جرّب دخول `/guests?invId={inviteId}`.
4. جرّب API `GET/POST` للمدعوين.

**Expected**
- `workflowStatus = approved`
- `reviewStatus = approved`
- تظهر للعميل إمكانية متابعة المرحلة التالية.
- صفحة المدعوين تصبح متاحة.
- APIs المدعوين ترجع نجاح طبيعي (200/201) بدل 409.

---

## AC-06: Return For Correction Flow

**Steps**
1. كأدمن، من صفحة المراجعة أدخل سبب إرجاع واضح.
2. اضغط "إرجاع للتعديل".
3. كعميل، افتح صفحة حالة الورشة وحاول دخول `/guests`.
4. نفّذ API المدعوين.

**Expected**
- `workflowStatus = needs_customer_update`
- `reviewStatus = changes_requested`
- سبب الإرجاع يظهر للمستخدم في صفحة الحالة.
- لا يمكن دخول المدعوين (UI redirect).
- APIs المدعوين ترجع `409`.

---

## AC-07: Admin Email Notification + Deep Link

**Steps**
1. نفّذ دفع دعوة جديدة (AC-01).
2. تحقق من صندوق بريد الأدمن.
3. افتح الرابط المرسل.

**Expected (Email Body)**
- يحتوي:
  - رقم الطلب
  - اسم المستخدم
  - نوع المناسبة
  - Deep link:
    - `/admin/invitations/review/{inviteId}`

**Expected (Behavior)**
- الرابط يفتح صفحة مراجعة الدعوة الصحيحة مباشرة.

---

## AC-08: Legacy Invite Compatibility

**Goal**
التحقق أن الدعوات القديمة لا تنكسر (التي لا تحتوي `workflowStatus`).

**Steps**
1. جهّز دعوة legacy (بدون `workflowStatus`) وكانت مدفوعة.
2. افتح `/guests?invId={legacyInviteId}`.
3. استدعِ API المدعوين.

**Expected**
- يسمح بالدخول باستخدام fallback legacy.
- لا يحصل كسر لتدفق الدعوات القديمة المدفوعة.

---

## API Validation Matrix (Quick)

- `POST /api/workshop/enter`:
  - نجاح: `200`
  - بدون `adminPreviewUrl`: `409`
  - بدون auth: `401`
- `/api/user/invitations/{invId}/guests`:
  - قبل `approved`: `409`
  - بعد `approved`: نجاح
- `POST /api/admin/invitations/review/{inviteId}/approve`:
  - admin فقط، يرفع الحالة إلى `approved`
- `POST /api/admin/invitations/review/{inviteId}/return`:
  - admin فقط، يتطلب `reason`

---

## Exit Criteria (Phase 1 Ready)

- كل السيناريوهات AC-01 .. AC-08 = Pass.
- لا يوجد bypass يسمح بالمدعوين قبل `approved` (UI/API).
- `adminPreviewUrl` متاح للأدمن قبل الاعتماد.
- البريد الإداري يحتوي deep link صحيح.
- لا كسر على الدعوات legacy.

