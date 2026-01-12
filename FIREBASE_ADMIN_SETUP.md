# إعداد Firebase Admin SDK

## المشكلة
Firebase Admin SDK غير مهيأ، لذلك الرفع يفشل.

## الحل: إعداد Service Account

### الخطوة 1: الحصول على Service Account Key

1. اذهب إلى Firebase Console: https://console.firebase.google.com/
2. اختر المشروع: **bushara-2df7e**
3. اذهب إلى **Project Settings** (⚙️ في الأعلى)
4. اضغط على تبويب **Service Accounts**
5. اضغط على **Generate new private key**
6. سيتم تحميل ملف JSON - احفظه

### الخطوة 2: إضافة إلى .env.local

1. افتح ملف `.env.local` في المشروع
2. أضف هذا السطر:

```env
FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"bushara-2df7e",...}
```

**مهم:** انسخ **كل** محتوى ملف JSON وضعه بين علامات الاقتباس.

**أو** يمكنك استخدام طريقة أخرى:

```env
FIREBASE_SERVICE_ACCOUNT_KEY='{"type":"service_account","project_id":"bushara-2df7e",...}'
```

### الخطوة 3: إعادة تشغيل الخادم

1. أوقف الخادم (Ctrl+C)
2. أعد تشغيله: `npm run dev`
3. انتظر حتى يبدأ
4. جرب رفع ملف مرة أخرى

---

## مثال على .env.local:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=bushara-2df7e.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=bushara-2df7e
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=bushara-2df7e.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id

FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"bushara-2df7e","private_key_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n","client_email":"...","client_id":"...","auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":"https://oauth2.googleapis.com/token","auth_provider_x509_cert_url":"https://www.googleapis.com/oauth2/v1/certs","client_x509_cert_url":"..."}
```

---

## ملاحظات مهمة:

1. **لا ترفع ملف `.env.local` إلى Git** - إنه في `.gitignore`
2. **Service Account Key حساس** - لا تشاركه مع أحد
3. **بعد إضافة المفتاح، أعد تشغيل الخادم**
4. **Admin SDK يتجاوز جميع قواعد الأمان** - هذا هو الحل النهائي

---

## التحقق من أن كل شيء يعمل:

بعد إضافة Service Account Key وإعادة تشغيل الخادم، يجب أن ترى في console:

```
✅ Firebase Admin initialized with service account
```

ثم عند رفع ملف:

```
✅ File uploaded successfully using Admin SDK: https://storage.googleapis.com/...
```
