/* ═══════════════════════════════════════════════════════════════════════════
   التصاميم — أريج شاولي للخياطة
   ───────────────────────────────────────────────────────────────────────────
   لإضافة تصميم: انسخي بلوكًا كاملًا والصقيه، ثم غيّري القيم.

   ⚠️  أي حقل = null معناه «غير معروف» — والموقع يُخفي سطره تلقائيًا.
       لا تكتبي قيمة إلا إذا كانت صحيحة. لا تُخمّني نوع القماش من الصورة.

   الحقول:
   • code          رمز التصميم — يظهر في رسالة الواتساب وفي رابط الصفحة
   • cat           prayer (أطقم صلاة) · turban (توربان) · scarf (طرح حجاب)
   • name          اسم التصميم
   • images        صور القطعة. الأولى هي الصورة الرئيسية.
                   file = اسم الملف داخل assets/images/products بدون .jpg
                   kind = front | detail | fabric | sleeve | closure
                   alt  = وصف الصورة لقارئات الشاشة ومحرّكات البحث
   • availability  made_to_order (تُفصَّل بعد الطلب) · sold_out (نفد القماش)
                   · coming_soon (قريبًا)
   • fabric        نوع القماش — null حتى تتأكّدي
   • care          تعليمات العناية — null حتى تتأكّدي
   • price         null، أو { amount: '١٥٠', from: true } إذا كان سعرًا يبدأ من
   • included      القطع المشمولة، مثال: ['الفستان', 'الطرحة']
   • customization ملاحظة عن التفصيل حسب الطلب
   • productionDays مدة التنفيذ لهذا التصميم تحديدًا، أو null لاستخدام العام
   • colors        ألوان القطعة كما تظهر في الصورة (وصف، لا خيارات للطلب)
   ═══════════════════════════════════════════════════════════════════════════ */

window.PRODUCTS = [
  {
    code: 'AS-01',
    cat: 'prayer',
    name: 'طقم صلاة — ورد بيج',
    images: [
      { file: 'as-01-rose-floral', kind: 'front',
        alt: 'طقم صلاة بنقش ورد بنّي على أرضية بيج وردية، بسحّاب أمامي وطرحة شيفون بيج منفصلة' }
    ],
    desc: 'فستان بسحّاب أمامي بنقش ورد بنّي على أرضية بيج وردية، مع طرحة شيفون سادة منفصلة.',
    details: ['سحّاب أمامي', 'طرحة شيفون منفصلة', 'أكمام واسعة بأساور'],
    colors: [
      { name: 'بيج وردي', hex: '#E0C4B5' },
      { name: 'بنّي',      hex: '#6B4A3E' },
      { name: 'شيفون بيج', hex: '#D8C3B0' }
    ],
    availability: 'made_to_order',
    fabric: null,
    care: null,
    price: null,
    included: ['الفستان', 'الطرحة'],
    customization: null,
    productionDays: null
  },
  {
    code: 'AS-02',
    cat: 'prayer',
    name: 'طقم صلاة — نقش دمشقي بنفسجي',
    images: [
      { file: 'as-02-purple-damask', kind: 'front',
        alt: 'طقم صلاة بنقش دمشقي بنفسجي غامق بتفاصيل بيضاء، بسحّاب أمامي وغطاء رأس متّصل' }
    ],
    desc: 'نقش دمشقي بنفسجي غامق بتفاصيل بيضاء دقيقة، بسحّاب أمامي وغطاء رأس متّصل.',
    details: ['سحّاب أمامي', 'غطاء رأس متّصل', 'أكمام واسعة'],
    colors: [
      { name: 'بنفسجي',   hex: '#5F3B7A' },
      { name: 'باذنجاني', hex: '#2C1D35' },
      { name: 'أبيض',     hex: '#E4E0E8' }
    ],
    availability: 'made_to_order',
    fabric: null,
    care: null,
    price: null,
    included: null,
    customization: null,
    productionDays: null
  },
  {
    code: 'AS-03',
    cat: 'prayer',
    name: 'طقم صلاة — ورد أصفر على أخضر',
    images: [
      { file: 'as-03-mint-rose', kind: 'front',
        alt: 'طقم صلاة قطعة واحدة بنقش ورد أصفر على أرضية خضراء فاتحة، بحواف دانتيل بيضاء' }
    ],
    desc: 'قطعة واحدة بنقش ورد أصفر على أرضية خضراء فاتحة، مزيّنة بشريط دانتيل على الغطاء والأكمام.',
    details: ['قطعة واحدة', 'دانتيل على غطاء الرأس', 'أساور بدانتيل'],
    colors: [
      { name: 'أخضر فاتح',   hex: '#B9D6C9' },
      { name: 'أصفر',        hex: '#E8D68B' },
      { name: 'دانتيل أبيض', hex: '#F1EFE7' }
    ],
    availability: 'made_to_order',
    fabric: null,
    care: null,
    price: null,
    included: null,
    customization: null,
    productionDays: null
  },
  {
    code: 'AS-04',
    cat: 'prayer',
    name: 'طقم صلاة — ساتان كريمي سادة',
    images: [
      { file: 'as-04-cream-satin', kind: 'front',
        alt: 'طقم صلاة سادة بلون كريمي من قماش لامع، بدانتيل ناعم على الصدر وأطراف الأكمام' }
    ],
    desc: 'تصميم سادة بلون كريمي هادئ من قماش لامع، بدانتيل ناعم على الصدر وأطراف الأكمام.',
    details: ['قطعة واحدة', 'دانتيل على الصدر والأكمام', 'لون سادة'],
    colors: [
      { name: 'كريمي',       hex: '#EFE0CB' },
      { name: 'دانتيل عاجي', hex: '#F7F1E6' }
    ],
    availability: 'made_to_order',
    fabric: null,
    care: null,
    price: null,
    included: null,
    customization: null,
    productionDays: null
  },
  {
    code: 'AS-05',
    cat: 'prayer',
    name: 'طقم صلاة — ورد على أزرق رمادي',
    images: [
      { file: 'as-05-blue-floral', kind: 'front',
        alt: 'طقم صلاة بنقش ورد بنّي وأبيض على أرضية زرقاء رمادية، ببانل دانتيل أمامي' }
    ],
    desc: 'نقش ورد بنّي وأبيض على أرضية زرقاء رمادية، مع بانل دانتيل أمامي وأساور دانتيل.',
    details: ['قطعة واحدة', 'بانل دانتيل أمامي', 'أساور بدانتيل'],
    colors: [
      { name: 'أزرق رمادي',  hex: '#7B92A5' },
      { name: 'بنّي',        hex: '#9E6C50' },
      { name: 'دانتيل أبيض', hex: '#ECEEEF' }
    ],
    availability: 'made_to_order',
    fabric: null,
    care: null,
    price: null,
    included: null,
    customization: null,
    productionDays: null
  }
];

/* الأقسام. status: 'available' يظهر عاديًا · 'soon' يظهر كـ«قريبًا» بلا فلتر فارغ.
   حوّلي القسم إلى 'available' فور إضافة أول تصميم فيه. */
window.CATEGORIES = [
  { id: 'prayer', label: 'أطقم الصلاة', status: 'available',
    blurb: 'بسحّاب أمامي أو قطعة واحدة، بغطاء رأس متّصل أو طرحة منفصلة.' },
  { id: 'turban', label: 'التوربان', status: 'soon',
    blurb: 'توربان قطني مريح للاستعمال اليومي.' },
  { id: 'scarf',  label: 'طرح الحجاب', status: 'soon',
    blurb: 'طرح من البوال والقطن، بأطوال حسب الرغبة.' }
];

/* المقاسات المطلوبة لكل قسم — تُستخدم في صفحة المقاسات وفي رسالة الواتساب */
window.MEASUREMENTS_BY_CAT = {
  prayer: ['length', 'chest', 'sleeve', 'head'],
  turban: ['head'],
  scarf:  ['length', 'head']
};
