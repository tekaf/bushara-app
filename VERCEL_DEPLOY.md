# دليل النشر على Vercel - مشروع بشارة

## ✅ لماذا Vercel؟

- ✅ يدعم Next.js App Router كاملاً
- ✅ يدعم API Routes (Stripe webhook/checkout)
- ✅ Environment Variables سهلة
- ✅ مجاني للمشاريع الصغيرة
- ✅ Deployments تلقائية من Git

## 🚀 خطوات النشر

### الطريقة 1: عبر Vercel CLI (الأسرع)

```bash
# 1. تثبيت Vercel CLI
npm i -g vercel

# 2. تسجيل الدخول
vercel login

# 3. النشر
vercel

# 4. (اختياري) النشر للإنتاج
vercel --prod
```

### الطريقة 2: عبر Vercel Dashboard (موصى به)

1. اذهب إلى [vercel.com](https://vercel.com)
2. سجل دخول بحساب GitHub/GitLab/Bitbucket
3. انقر "Add New Project"
4. اربط repository الخاص بك
5. Vercel سيكتشف Next.js تلقائياً
6. أضف Environment Variables:
   ```
   NEXT_PUBLIC_FIREBASE_API_KEY=...
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
   NEXT_PUBLIC_FIREBASE_APP_ID=...
   STRIPE_SECRET_KEY=...
   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=...
   STRIPE_WEBHOOK_SECRET=...
   ```
7. انقر "Deploy"

## ⚙️ إعداد Stripe Webhook بعد النشر

بعد النشر على Vercel:

1. اذهب إلى Stripe Dashboard → Developers → Webhooks
2. أضف endpoint جديد:
   ```
   https://your-domain.vercel.app/api/stripe/webhook
   ```
3. اختر events: `checkout.session.completed`
4. انسخ Webhook signing secret
5. أضفه في Vercel Environment Variables كـ `STRIPE_WEBHOOK_SECRET`

## 📝 ملاحظات

- Vercel يعطي domain مجاني (مثل: `bushara-app.vercel.app`)
- يمكن ربط domain مخصص
- كل push إلى main branch = deployment تلقائي
- Environment Variables محمية ولا تظهر في الكود

## 🔗 روابط مفيدة

- [Vercel Documentation](https://vercel.com/docs)
- [Next.js on Vercel](https://vercel.com/docs/frameworks/nextjs)

