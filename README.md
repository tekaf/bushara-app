# بشارة (Bushara) - منصة الدعوات الإلكترونية

منصة احترافية لإنشاء دعوات زواج ومناسبات إلكترونية مع QR codes وإدارة الحضور.

## المميزات

- ✅ إنشاء دعوات إلكترونية احترافية
- ✅ QR code فريد لكل ضيف
- ✅ إدارة الضيوف والحضور
- ✅ إرسال عبر واتساب
- ✅ مسح QR للدخول
- ✅ نظام باقات مرن
- ✅ دعم RTL كامل

## التقنيات المستخدمة

- **Next.js 14** (App Router) + TypeScript
- **TailwindCSS** للتصميم
- **Framer Motion** للأنيميشن
- **Firebase** (Auth + Firestore + Storage)
- **QR Code** (qrcode.react + html5-qrcode)
- **Stripe** للدفع

## خطوات التشغيل

### 1. تثبيت الاعتماديات

```bash
npm install
```

### 2. إعداد Firebase

أنشئ ملف `.env.local` في جذر المشروع:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_auth_domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_storage_bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
```

### 3. إعداد Firestore Security Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can only read/write their own user document
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Invites
    match /invites/{inviteId} {
      allow read: if request.auth != null && resource.data.ownerId == request.auth.uid;
      allow create: if request.auth != null && request.resource.data.ownerId == request.auth.uid;
      allow update, delete: if request.auth != null && resource.data.ownerId == request.auth.uid;
      
      // Guests subcollection
      match /guests/{guestId} {
        allow read: if request.auth != null;
        allow write: if request.auth != null && get(/databases/$(database)/documents/invites/$(inviteId)).data.ownerId == request.auth.uid;
      }
    }
    
    // Payments
    match /payments/{paymentId} {
      allow read, write: if request.auth != null && resource.data.userId == request.auth.uid;
    }
    
    // Check-in logs
    match /checkin_logs/{logId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null;
    }
  }
}
```

### 4. تشغيل المشروع

```bash
npm run dev
```

افتح [http://localhost:3000](http://localhost:3000) في المتصفح.

## البنية الأساسية

```
/app
  /(public)          # الصفحات العامة
    /packages        # صفحة الباقات
    /designs         # صفحة التصاميم
    /invite/[id]     # صفحة الدعوة العامة
  /(auth)            # صفحات المصادقة
    /login
    /register
  /(dashboard)       # لوحة التحكم
    /dashboard
      /invites       # إدارة الدعوات
      /billing       # الفواتير
    /checkin/[id]    # صفحة المسح

/components
  /ui                # مكونات واجهة عامة
  /sections          # أقسام الصفحات
  /auth              # مكونات المصادقة

/lib
  /firebase          # إعدادات Firebase
  /auth              # منطق المصادقة
  /qr                # منطق QR codes
```

## الباقات

- 50 ضيف - 99 ريال
- 100 ضيف - 179 ريال
- 150 ضيف - 249 ريال
- 200 ضيف - 319 ريال
- 250 ضيف - 389 ريال
- 300 ضيف - 459 ريال
- 350 ضيف - 529 ريال
- 400 ضيف - 599 ريال
- 450 ضيف - 669 ريال

## الحالة الحالية

✅ Landing Page كاملة
✅ صفحة الباقات
✅ نظام المصادقة (Register/Login)
✅ Dashboard الأساسي
✅ إنشاء الدعوات
✅ صفحة الدعوة العامة
✅ صفحة Check-in مع QR Scanner

⏳ قيد التطوير:
- إضافة الضيوف وتوليد QR
- إعداد Stripe للدفع
- تحسينات UI/UX

## الترخيص

جميع الحقوق محفوظة © 2024

