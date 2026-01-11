# الخطوات التالية - مشروع بشارة

## ✅ ما تم إنجازه حتى الآن:
- ✅ المشروع جاهز بالكامل
- ✅ Firebase project تم إعداده (`lino-72af5`)
- ✅ جميع الملفات والكود جاهز

## 📋 الخطوات التالية (بالترتيب):

### 1️⃣ إعداد Firebase في Console

1. اذهب إلى [Firebase Console](https://console.firebase.google.com/)
2. اختر المشروع `lino-72af5` (أو المشروع الذي تريد استخدامه)
3. فعّل **Authentication**:
   - اذهب إلى Authentication → Sign-in method
   - فعّل **Email/Password**
4. أنشئ **Firestore Database**:
   - اذهب إلى Firestore Database
   - انقر "Create database"
   - اختر "Start in production mode"
   - اختر موقع (location)
5. انسخ **Firestore Security Rules**:
   - اذهب إلى Firestore Database → Rules
   - انسخ محتوى ملف `firestore.rules` من المشروع
   - الصقه في Firebase Console
   - انقر "Publish"

### 2️⃣ إنشاء ملف `.env.local`

1. في جذر المشروع، أنشئ ملف `.env.local`
2. اذهب إلى Firebase Console → Project Settings → General
3. في قسم "Your apps"، إذا لم يكن هناك Web app، أنشئ واحداً
4. انسخ بيانات الإعداد وأضفها في `.env.local`:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key_here
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=lino-72af5.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=lino-72af5
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=lino-72af5.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=your_measurement_id
```

### 3️⃣ تجربة المشروع محلياً

```bash
# تأكد من تثبيت الاعتماديات
npm install

# شغّل المشروع
npm run dev
```

افتح [http://localhost:3000](http://localhost:3000) وتأكد أن كل شيء يعمل.

### 4️⃣ إعداد Stripe (اختياري - للدفع)

إذا كنت تريد تفعيل الدفع:

1. سجل في [Stripe](https://stripe.com/)
2. احصل على API Keys من Dashboard → Developers → API keys
3. أضف المفاتيح إلى `.env.local`:

```env
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

### 5️⃣ النشر

#### الخيار 1: Vercel (موصى به - يدعم API Routes)

```bash
# تثبيت Vercel CLI
npm i -g vercel

# النشر
vercel
```

Vercel سيدعم:
- ✅ API Routes (Stripe)
- ✅ Environment Variables
- ✅ Automatic deployments

#### الخيار 2: Firebase Hosting (بدون API Routes)

```bash
# بناء المشروع
npm run build

# النشر
firebase deploy --only hosting
```

⚠️ **ملاحظة**: API Routes لن تعمل مع Firebase Hosting العادي.

## 🎯 ملخص سريع:

1. ✅ Firebase project جاهز
2. ⏳ إعداد Firebase Console (Auth + Firestore)
3. ⏳ إنشاء `.env.local`
4. ⏳ تجربة محلياً
5. ⏳ النشر

## ❓ أسئلة شائعة:

**س: كيف أحصل على Firebase config؟**
ج: Firebase Console → Project Settings → General → Your apps → Web app

**س: ماذا لو لم يعمل المشروع محلياً؟**
ج: تأكد من:
- وجود ملف `.env.local` مع جميع المتغيرات
- تفعيل Email/Password في Authentication
- إنشاء Firestore Database

**س: أين أنشر المشروع؟**
ج: استخدم **Vercel** للحصول على أفضل تجربة مع Next.js.

---

**الخطوة التالية**: ابدأ بإعداد Firebase Console ثم أنشئ ملف `.env.local` 🚀

