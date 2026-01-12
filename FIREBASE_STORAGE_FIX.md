# حل مشكلة Firebase Storage 403 Error

## المشكلة
```
Firebase Storage: User does not have permission to access (storage/unauthorized)
```

## الحل السريع

### الخطوة 1: اذهب إلى Firebase Console
1. افتح: https://console.firebase.google.com/
2. اختر المشروع: **bushara-2df7e**
3. من القائمة الجانبية: **Storage**
4. اضغط على تبويب **Rules**

### الخطوة 2: انسخ هذه القواعد بالضبط

**انسخ كل هذا النص:**

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /templates/{templateId}/{allPaths=**} {
      allow read, write: if true;
    }
    
    match /users/{userId}/{allPaths=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
```

### الخطوة 3: الصق ونشر
1. احذف **كل** القواعد القديمة في Firebase Console
2. الصق القواعد الجديدة
3. اضغط **Publish** (نشر)
4. انتظر حتى تظهر رسالة "Rules published successfully"

### الخطوة 4: اختبر
ارجع إلى الصفحة وجرب رفع ملف مرة أخرى

---

## إذا استمرت المشكلة:

### تحقق من:
1. ✅ هل نشرت القواعد؟ (يجب أن ترى "Rules published successfully")
2. ✅ هل نسخت القواعد بالضبط كما هي أعلاه؟
3. ✅ هل انتظرت 10-30 ثانية بعد النشر؟
4. ✅ هل قمت بتحديث الصفحة (F5) بعد النشر؟

### بديل: استخدام Firebase CLI
إذا كان لديك Firebase CLI مثبت:

```bash
firebase deploy --only storage
```

---

## ملاحظة أمنية
القواعد الحالية تسمح للجميع بالرفع في `templates/`. هذا للتطوير فقط.
في الإنتاج، يجب تقييد الوصول.
