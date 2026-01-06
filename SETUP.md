# دليل الإعداد - مشروع بشارة

## الخطوات الأساسية

### 1. تثبيت الاعتماديات

```bash
npm install
```

### 2. إعداد Firebase

1. اذهب إلى [Firebase Console](https://console.firebase.google.com/)
2. أنشئ مشروع جديد أو استخدم مشروع موجود
3. فعّل Authentication → Email/Password
4. أنشئ Firestore Database (Production mode)
5. انسخ بيانات الإعداد من Project Settings → General → Your apps
6. أنشئ ملف `.env.local` في جذر المشروع:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
```

### 3. إعداد Firestore Security Rules

1. اذهب إلى Firestore Database → Rules
2. انسخ محتوى ملف `firestore.rules` والصقه في Firebase Console
3. انقر "Publish"

### 4. إعداد Stripe (اختياري - للدفع)

1. سجل في [Stripe](https://stripe.com/)
2. احصل على API Keys من Dashboard → Developers → API keys
3. أضف المفاتيح إلى `.env.local`:

```env
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

4. لإعداد Webhook:
   - اذهب إلى Stripe Dashboard → Developers → Webhooks
   - أضف endpoint: `https://yourdomain.com/api/stripe/webhook`
   - اختر events: `checkout.session.completed`
   - انسخ Webhook signing secret

### 5. تشغيل المشروع

```bash
npm run dev
```

افتح [http://localhost:3000](http://localhost:3000)

## البنية الأساسية

### الصفحات العامة
- `/` - الصفحة الرئيسية
- `/packages` - الباقات
- `/designs` - التصاميم
- `/invite/[id]` - صفحة الدعوة العامة

### صفحات المصادقة
- `/login` - تسجيل الدخول
- `/register` - إنشاء حساب

### لوحة التحكم
- `/dashboard` - الرئيسية
- `/dashboard/invites` - قائمة الدعوات
- `/dashboard/invites/new` - إنشاء دعوة
- `/dashboard/invites/[id]` - تفاصيل الدعوة
- `/dashboard/billing` - الفواتير
- `/checkin/[id]` - صفحة المسح

## الملفات المهمة

- `lib/firebase/config.ts` - إعدادات Firebase
- `lib/auth/context.tsx` - سياق المصادقة
- `lib/qr/generator.ts` - توليد QR codes
- `firestore.rules` - قواعد الأمان

## ملاحظات

- تأكد من تفعيل Email/Password في Firebase Authentication
- تأكد من نشر Firestore Security Rules
- للاستخدام في الإنتاج، استخدم Stripe Live keys بدلاً من Test keys

