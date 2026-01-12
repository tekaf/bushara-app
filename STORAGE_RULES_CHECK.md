# ⚠️ مهم جداً: تحقق من نشر القواعد

## من الصورة أرى أن القواعد موجودة، لكن يجب التأكد من:

### 1. هل نُشرت القواعد؟
- في Firebase Console → Storage → Rules
- **يجب أن ترى زر "Publish" في الأعلى**
- **اضغط على "Publish"** إذا لم تكن نُشرت
- **انتظر** رسالة "Rules published successfully"

### 2. القواعد المطلوبة بالضبط:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /templates/{allPaths=**} {
      allow read, write: if true;
    }
    match /uploads/{userId}/{allPaths=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    match /fonts/{allPaths=**} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.token.admin == true;
    }
    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
```

### 3. بعد النشر:
- **انتظر 60 ثانية**
- **أغلق المتصفح بالكامل**
- **افتح نافذة Incognito جديدة**
- **جرب رفع ملف**

---

## إذا استمرت المشكلة:

### الحل البديل: استخدام Firebase Admin SDK

1. اذهب إلى Firebase Console → Project Settings → Service Accounts
2. انقر "Generate new private key"
3. احفظ الملف JSON
4. أضف محتوى الملف إلى `.env.local`:

```
FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account",...}
```

5. أعد تشغيل الخادم

---

## أو استخدم هذه القواعد المفتوحة تماماً (للتطوير فقط):

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if true;
    }
  }
}
```

⚠️ **تحذير:** هذه القواعد تسمح للجميع بالوصول لكل شيء!
