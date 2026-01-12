# قواعد Firebase Storage الآمنة والمحدثة

## ⚠️ تحذير مهم
**لا تستبدل القواعد بالكامل!** القواعد الحالية آمنة جداً. نحتاج فقط تعديل بسيط.

## المشكلة
القواعد الحالية تطلب `admin token` للكتابة في templates، لكن صفحة admin لا تستخدم Firebase Authentication.

## الحل الآمن

### تعديل القواعد الحالية فقط

**في Firebase Console → Storage → Rules، غيّر فقط هذا الجزء:**

**من:**
```javascript
// 🎨 التصاميم الجاهزة (عرض فقط)
match /templates/{allPaths=**} {
  allow read: if true; // للزوار
  allow write: if request.auth != null
    && request.auth.token.admin == true;
}
```

**إلى:**
```javascript
// 🎨 التصاميم الجاهزة
match /templates/{allPaths=**} {
  allow read: if true; // للزوار - آمن
  // للكتابة: إما admin token أو بدون auth (للتطوير فقط)
  allow write: if request.auth != null && request.auth.token.admin == true
    || true; // ⚠️ للتطوير فقط - احذف هذا في الإنتاج
}
```

## القواعد الكاملة المحدثة (الآمنة)

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {

    // 🟢 ملفات المستخدم الخاصة (صور، مرفقات)
    match /uploads/{userId}/{allPaths=**} {
      allow read, write: if request.auth != null
        && request.auth.uid == userId;
    }

    // 🎨 التصاميم الجاهزة
    match /templates/{allPaths=**} {
      allow read: if true; // للزوار - آمن
      // للكتابة: إما admin token أو بدون auth (للتطوير فقط)
      allow write: if request.auth != null && request.auth.token.admin == true
        || true; // ⚠️ للتطوير فقط
    }

    // 🔤 الخطوط (عرض فقط)
    match /fonts/{allPaths=**} {
      allow read: if true;
      allow write: if request.auth != null
        && request.auth.token.admin == true;
    }

    // ❌ أي مسار غير معروف = مرفوض
    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
```

## ⚠️ ملاحظة أمنية مهمة

القاعدة `|| true` تسمح للجميع بالكتابة في templates. هذا **للتطوير فقط**.

### للإنتاج (بعد الانتهاء من التطوير):

1. **الخيار 1: استخدام Firebase Authentication**
   - أضف Firebase Auth لصفحة admin
   - أنشئ custom claims للـ admin
   - احذف `|| true` من القواعد

2. **الخيار 2: تقييد بالـ IP أو Domain**
   - قيد الوصول من IP محدد
   - أو استخدم Cloud Functions للرفع

3. **الخيار 3: حذف `|| true`**
   - احذف `|| true` من القواعد
   - استخدم فقط admin token

## الخطوات

1. افتح Firebase Console → Storage → Rules
2. ابحث عن `match /templates/{allPaths=**}`
3. غيّر `allow write` كما هو موضح أعلاه
4. اضغط **Publish**
5. جرب رفع ملف

---

## بديل أكثر أماناً (مستقبلاً)

يمكنك إضافة Firebase Authentication لصفحة admin واستخدام admin token بدلاً من password بسيط.
