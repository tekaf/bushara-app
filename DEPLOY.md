# دليل النشر على Firebase Hosting

## ⚠️ ملاحظة مهمة

المشروع يستخدم **API Routes** (Stripe checkout/webhook)، لذلك يحتاج إلى خادم (server). Firebase Hosting العادي يدعم فقط الملفات الثابتة.

## ✅ الخيارات المتاحة:

### الخيار 1: استخدام Vercel (موصى به - الأسهل)
Vercel هو المنصة الرسمية لـ Next.js وتدعم جميع الميزات تلقائياً:

```bash
# تثبيت Vercel CLI
npm i -g vercel

# النشر
vercel
```

### الخيار 2: استخدام Firebase مع Next.js (معقد)
اتبع [الدليل الرسمي](https://firebase.google.com/docs/hosting/nextjs)

### الخيار 3: استخدام Firebase Hosting فقط (بدون API Routes)
إذا كنت تريد استخدام Firebase Hosting فقط، ستحتاج إلى:
- تحويل API Routes إلى Firebase Functions
- أو إزالة API Routes مؤقتاً

## 📋 خطوات النشر على Firebase Hosting (بسيط)

1. **تثبيت Firebase CLI**:
```bash
npm install -g firebase-tools
```

2. **تسجيل الدخول**:
```bash
firebase login
```

3. **تهيئة المشروع**:
```bash
firebase init hosting
```
- اختر مشروع Firebase الموجود
- Public directory: `out` (إذا استخدمت static export)
- Single-page app: Yes
- GitHub: No (أو نعم حسب رغبتك)

4. **إنشاء ملف `.firebaserc`** (إذا لم يكن موجوداً):
```json
{
  "projects": {
    "default": "your-project-id"
  }
}
```

5. **بناء المشروع**:
```bash
npm run build
```

6. **النشر**:
```bash
firebase deploy --only hosting
```

## 🔧 الإعداد الحالي

تم إنشاء `firebase.json` مع إعدادات أساسية. يمكنك تعديله حسب احتياجاتك.

## ⚠️ تحذيرات

- **API Routes لن تعمل** مع Firebase Hosting العادي
- تحتاج إلى **Firebase Functions** لـ API Routes
- **Environment Variables** يجب إضافتها في Firebase Console
- **Stripe Webhook** يحتاج إلى URL جديد بعد النشر

## 💡 نصيحة

للحصول على أفضل تجربة مع Next.js + API Routes، استخدم **Vercel**.

