# حل مشكلة Missing or insufficient permissions

## المشكلة
```
Error uploading template: FirebaseError: Missing or insufficient permissions.
```

## الحل النهائي - اتبع الخطوات بالضبط

### الخطوة 1: تأكد من أنك في المشروع الصحيح
1. افتح: https://console.firebase.google.com/
2. **تأكد** أن المشروع المختار هو: **bushara-2df7e**
   - إذا لم يكن كذلك، اختره من القائمة

### الخطوة 2: افتح Storage Rules
1. من القائمة الجانبية اليسرى: **Storage**
2. اضغط على تبويب **Rules** (في الأعلى)

### الخطوة 3: انسخ القواعد بالضبط
انسخ **كل** هذا النص (بدون أي تعديل):

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /uploads/{userId}/{allPaths=**} {
      allow read, write: if request.auth != null
        && request.auth.uid == userId;
    }
    match /templates/{allPaths=**} {
      allow read: if true;
      allow write: if true;
    }
    match /fonts/{allPaths=**} {
      allow read: if true;
      allow write: if request.auth != null
        && request.auth.token.admin == true;
    }
    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
```

### الخطوة 4: الصق ونشر
1. **احذف كل** القواعد القديمة في Firebase Console
2. **الصق** القواعد الجديدة (Ctrl+V)
3. اضغط **Publish** (نشر)
4. **انتظر** حتى تظهر رسالة "Rules published successfully"

### الخطوة 5: تحقق من النشر
1. بعد النشر، **انتظر 30 ثانية**
2. **حدّث** الصفحة في المتصفح (F5)
3. **أغلق** وافتح المتصفح مرة أخرى
4. جرب رفع ملف مرة أخرى

---

## إذا استمرت المشكلة:

### تحقق من:
1. ✅ هل المشروع الصحيح؟ (bushara-2df7e)
2. ✅ هل نشرت القواعد؟ (يجب أن ترى "Rules published successfully")
3. ✅ هل انتظرت 30 ثانية بعد النشر؟
4. ✅ هل حدّثت الصفحة (F5)؟
5. ✅ هل أغلقت وفتحت المتصفح؟

### بديل: تحقق من القواعد مباشرة
1. في Firebase Console → Storage → Rules
2. تأكد أن القواعد تحتوي على:
   ```
   match /templates/{allPaths=**} {
     allow read: if true;
     allow write: if true;
   }
   ```

### إذا لم تعمل:
جرب هذا البديل (أقل أماناً لكن يعمل):

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

⚠️ **تحذير:** هذه القواعد تسمح للجميع بالوصول لكل شيء. استخدمها فقط للتطوير!

---

## ملاحظة مهمة
المسار الذي يستخدمه الكود: `templates/{templateId}/background.pdf`
القواعد تبحث عن: `templates/{allPaths=**}`

هذا يجب أن يعمل. إذا لم يعمل، المشكلة في نشر القواعد.
