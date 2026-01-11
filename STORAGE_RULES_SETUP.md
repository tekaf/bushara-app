# إعداد قواعد Firebase Storage

## المشكلة
عند رفع ملفات (صور أو PDF) إلى Firebase Storage، يظهر خطأ:
```
Firebase Storage: User does not have permission to access (storage/unauthorized)
```

## الحل - اتبع الخطوات بالترتيب:

### الخطوة 1: افتح Firebase Console
1. اذهب إلى [Firebase Console](https://console.firebase.google.com/)
2. سجل الدخول بحسابك
3. اختر المشروع: **bushara-2df7e**

### الخطوة 2: افتح Storage Rules
1. في القائمة الجانبية اليسرى، انقر على **Storage**
2. انقر على تبويب **Rules** (في الأعلى بجانب Data, Usage, Files)

### الخطوة 3: انسخ والصق القواعد
1. افتح ملف `STORAGE_RULES.txt` في المشروع
2. انسخ كل المحتوى (Ctrl+A ثم Ctrl+C)
3. في Firebase Console، احذف القواعد القديمة (إذا كانت موجودة)
4. الصق القواعد الجديدة (Ctrl+V)

### الخطوة 4: انشر القواعد
1. انقر على زر **Publish** (نشر) في الأعلى
2. انتظر حتى تظهر رسالة النجاح

### الخطوة 5: اختبر الرفع
ارجع إلى الصفحة وجرب رفع ملف مرة أخرى

---

## القواعد المطلوبة (موجودة في STORAGE_RULES.txt):

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /templates/{templateId}/{allPaths=**} {
      allow read: if true;
      allow write: if true;
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

---

## ملاحظة مهمة ⚠️
- القواعد الحالية تسمح للجميع بالرفع في مجلد `templates/`
- هذا مناسب للتطوير فقط
- في الإنتاج، يجب تقييد الوصول للمستخدمين المخولين فقط
