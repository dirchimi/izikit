import type { Locale } from './config';

// Dictionnaire FR / EN / AR. Chaque clé porte ses traductions côte à côte.
// `ar` est optionnel : une clé sans arabe retombe sur le français (résilience +
// les écrans futurs peuvent n'ajouter que { fr, en } sans casser le build).
// Interpolation : « {name} » remplacé via l'argument `vars`.

type Msg = { fr: string; en: string; ar?: string };

const messages: Record<string, Msg> = {
  // ── Commun / navigation / chrome ──────────────────────────────────────────
  'nav.dashboard': { fr: 'Tableau de bord', en: 'Dashboard', ar: 'لوحة التحكم' },
  'nav.vendre': { fr: 'Vendre', en: 'Sell', ar: 'بيع' },
  'nav.ventes': { fr: 'Ventes', en: 'Sales', ar: 'المبيعات' },
  'nav.stock': { fr: 'Stock', en: 'Inventory', ar: 'المخزون' },
  'nav.creances': { fr: 'Créances', en: 'Receivables', ar: 'الديون' },
  'nav.depenses': { fr: 'Dépenses', en: 'Expenses', ar: 'المصروفات' },
  'nav.documents': { fr: 'Documents', en: 'Documents', ar: 'المستندات' },
  'nav.rapports': { fr: 'Rapports', en: 'Reports', ar: 'التقارير' },
  'nav.parametres': { fr: 'Paramètres', en: 'Settings', ar: 'الإعدادات' },
  'role.patron': { fr: 'Patron', en: 'Owner', ar: 'المالك' },
  'offline.syncPending': {
    fr: 'Hors ligne — sync en attente',
    en: 'Offline — sync pending',
    ar: 'غير متصل — المزامنة معلّقة',
  },
  'offline.short': { fr: 'Hors ligne', en: 'Offline', ar: 'غير متصل' },
  'lang.soon': {
    fr: 'العربية — bientôt disponible.',
    en: 'Arabic — coming soon.',
    ar: 'العربية متاحة الآن.',
  },
  'topbar.light': { fr: 'Clair', en: 'Light', ar: 'فاتح' },
  'topbar.dark': { fr: 'Sombre', en: 'Dark', ar: 'داكن' },
  'topbar.newSale': { fr: 'Nouvelle vente', en: 'New sale', ar: 'بيع جديد' },
  'common.edit': { fr: 'Modifier', en: 'Edit', ar: 'تعديل' },

  // ── Authentification ──────────────────────────────────────────────────────
  'auth.tagline': {
    fr: 'Gestion de boutique simplifiée',
    en: 'Simple shop management',
    ar: 'إدارة متجر مبسّطة',
  },
  'auth.verifyTagline': {
    fr: 'Vérifie ton adresse e-mail',
    en: 'Verify your email',
    ar: 'تحقّق من بريدك الإلكتروني',
  },
  'auth.email': { fr: 'Adresse e-mail', en: 'Email address', ar: 'البريد الإلكتروني' },
  'auth.emailPlaceholder': { fr: 'vous@exemple.com', en: 'you@example.com', ar: 'you@example.com' },
  'auth.password': { fr: 'Mot de passe', en: 'Password', ar: 'كلمة المرور' },
  'auth.showPw': { fr: 'Afficher le mot de passe', en: 'Show password', ar: 'إظهار كلمة المرور' },
  'auth.hidePw': { fr: 'Masquer le mot de passe', en: 'Hide password', ar: 'إخفاء كلمة المرور' },
  'auth.remember': { fr: 'Se souvenir de moi', en: 'Remember me', ar: 'تذكّرني' },
  'auth.forgot': {
    fr: 'Mot de passe oublié ?',
    en: 'Forgot password?',
    ar: 'هل نسيت كلمة المرور؟',
  },
  'auth.forgotSoon': {
    fr: 'Récupération de mot de passe à venir.',
    en: 'Password recovery coming soon.',
    ar: 'استعادة كلمة المرور قريباً.',
  },
  'auth.login': { fr: 'Se connecter', en: 'Log in', ar: 'تسجيل الدخول' },
  'auth.loggingIn': { fr: 'Connexion…', en: 'Logging in…', ar: 'جارٍ تسجيل الدخول…' },
  'auth.or': { fr: 'ou', en: 'or', ar: 'أو' },
  'auth.googleContinue': {
    fr: 'Continuer avec Google',
    en: 'Continue with Google',
    ar: 'المتابعة باستخدام Google',
  },
  'auth.googleSignup': {
    fr: 'S’inscrire avec Google',
    en: 'Sign up with Google',
    ar: 'التسجيل باستخدام Google',
  },
  'auth.noAccount': {
    fr: 'Pas encore de compte ?',
    en: 'No account yet?',
    ar: 'ليس لديك حساب بعد؟',
  },
  'auth.signupLink': { fr: 'S’inscrire', en: 'Sign up', ar: 'إنشاء حساب' },
  'auth.haveAccount': {
    fr: 'Déjà un compte ?',
    en: 'Already have an account?',
    ar: 'لديك حساب بالفعل؟',
  },
  'auth.signupIntro': {
    fr: 'Crée ton compte pour gérer ta boutique.',
    en: 'Create your account to manage your shop.',
    ar: 'أنشئ حسابك لإدارة متجرك.',
  },
  'auth.confirmPw': {
    fr: 'Confirme le mot de passe',
    en: 'Confirm password',
    ar: 'تأكيد كلمة المرور',
  },
  'auth.pwHint': {
    fr: 'Au moins 8 caractères.',
    en: 'At least 8 characters.',
    ar: '8 أحرف على الأقل.',
  },
  'auth.createAccount': { fr: 'Créer mon compte', en: 'Create my account', ar: 'إنشاء حسابي' },
  'auth.creating': { fr: 'Création…', en: 'Creating…', ar: 'جارٍ الإنشاء…' },
  'auth.verifyIntro': {
    fr: 'Saisis le code à 8 caractères envoyé à ton adresse e-mail.',
    en: 'Enter the 8-character code sent to your email.',
    ar: 'أدخل الرمز المكوّن من 8 أحرف المُرسَل إلى بريدك الإلكتروني.',
  },
  'auth.code': { fr: 'Code de vérification', en: 'Verification code', ar: 'رمز التحقق' },
  'auth.verify': { fr: 'Vérifier mon e-mail', en: 'Verify my email', ar: 'تأكيد بريدي الإلكتروني' },
  'auth.verifying': { fr: 'Vérification…', en: 'Verifying…', ar: 'جارٍ التحقق…' },
  'auth.codeNotReceived': {
    fr: 'Code non reçu ?',
    en: 'Didn’t get the code?',
    ar: 'لم تستلم الرمز؟',
  },
  'auth.retrySignup': { fr: 'Recommencer l’inscription', en: 'Sign up again', ar: 'إعادة التسجيل' },
  'auth.err.invalidCredentials': {
    fr: 'E-mail ou mot de passe incorrect.',
    en: 'Incorrect email or password.',
    ar: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
  },
  'auth.err.lockedOut': {
    fr: 'Compte temporairement bloqué. Réessaie dans quelques minutes.',
    en: 'Account temporarily locked. Try again in a few minutes.',
    ar: 'تم قفل الحساب مؤقتاً. حاول مجدداً بعد بضع دقائق.',
  },
  'auth.err.suspended': {
    fr: 'Ce compte a été suspendu. Contacte le support.',
    en: 'This account has been suspended. Contact support.',
    ar: 'تم تعليق هذا الحساب. تواصل مع الدعم.',
  },
  'auth.err.tooManyLogin': {
    fr: 'Trop de tentatives. Réessaie dans quelques minutes.',
    en: 'Too many attempts. Try again in a few minutes.',
    ar: 'محاولات كثيرة جداً. حاول مجدداً بعد بضع دقائق.',
  },
  'auth.err.validationLogin': {
    fr: 'Saisis un e-mail et un mot de passe valides.',
    en: 'Enter a valid email and password.',
    ar: 'أدخل بريداً إلكترونياً وكلمة مرور صالحين.',
  },
  'auth.err.loginFailed': {
    fr: 'Connexion impossible.',
    en: 'Login failed.',
    ar: 'تعذّر تسجيل الدخول.',
  },
  'auth.err.network': {
    fr: 'Connexion impossible. Vérifie ta connexion.',
    en: 'Can’t connect. Check your network.',
    ar: 'تعذّر الاتصال. تحقّق من اتصالك بالإنترنت.',
  },
  'auth.err.pwBanned': {
    fr: 'Ce mot de passe est trop courant. Choisis-en un autre.',
    en: 'This password is too common. Choose another.',
    ar: 'كلمة المرور هذه شائعة جداً. اختر غيرها.',
  },
  'auth.err.pwShort': {
    fr: 'Mot de passe trop court.',
    en: 'Password too short.',
    ar: 'كلمة المرور قصيرة جداً.',
  },
  'auth.err.pwPwned': {
    fr: 'Ce mot de passe a fuité dans une base connue. Choisis-en un autre.',
    en: 'This password leaked in a known breach. Choose another.',
    ar: 'تسرّبت كلمة المرور هذه في خرق معروف. اختر غيرها.',
  },
  'auth.err.tooManySignup': {
    fr: 'Trop de tentatives d’inscription. Réessaie plus tard.',
    en: 'Too many signup attempts. Try again later.',
    ar: 'محاولات تسجيل كثيرة جداً. حاول لاحقاً.',
  },
  'auth.err.validationEmail': {
    fr: 'Saisis une adresse e-mail valide.',
    en: 'Enter a valid email address.',
    ar: 'أدخل بريداً إلكترونياً صالحاً.',
  },
  'auth.err.signupFailed': {
    fr: 'Inscription impossible.',
    en: 'Signup failed.',
    ar: 'تعذّر إنشاء الحساب.',
  },
  'auth.err.signupNetwork': {
    fr: 'Inscription impossible. Vérifie ta connexion.',
    en: 'Signup failed. Check your network.',
    ar: 'تعذّر إنشاء الحساب. تحقّق من اتصالك.',
  },
  'auth.err.pwMismatch': {
    fr: 'Les mots de passe ne correspondent pas.',
    en: 'Passwords do not match.',
    ar: 'كلمتا المرور غير متطابقتين.',
  },
  'auth.err.codeInvalid': {
    fr: 'Code invalide. Vérifie les 8 caractères reçus par e-mail.',
    en: 'Invalid code. Check the 8 characters from your email.',
    ar: 'رمز غير صالح. تحقّق من الأحرف الثمانية المُرسَلة إلى بريدك.',
  },
  'auth.err.codeExpired': {
    fr: 'Code expiré. Relance une inscription pour en recevoir un nouveau.',
    en: 'Code expired. Sign up again to get a new one.',
    ar: 'انتهت صلاحية الرمز. سجّل من جديد للحصول على رمز آخر.',
  },
  'auth.err.tooManyVerify': {
    fr: 'Trop de tentatives. Réessaie dans quelques minutes.',
    en: 'Too many attempts. Try again in a few minutes.',
    ar: 'محاولات كثيرة جداً. حاول مجدداً بعد بضع دقائق.',
  },
  'auth.err.validationCode': {
    fr: 'E-mail ou code au mauvais format.',
    en: 'Email or code in wrong format.',
    ar: 'صيغة البريد الإلكتروني أو الرمز غير صحيحة.',
  },
  'auth.err.verifyFailed': {
    fr: 'Vérification impossible.',
    en: 'Verification failed.',
    ar: 'تعذّر التحقق.',
  },
  'auth.err.verifyNetwork': {
    fr: 'Vérification impossible. Vérifie ta connexion.',
    en: 'Verification failed. Check your network.',
    ar: 'تعذّر التحقق. تحقّق من اتصالك.',
  },
  // ── Landing (accueil public) ──────────────────────────────────────────────
  'landing.nav.features': { fr: 'Fonctionnalités', en: 'Features', ar: 'المزايا' },
  'landing.nav.pricing': { fr: 'Tarifs', en: 'Pricing', ar: 'الأسعار' },
  'landing.nav.contact': { fr: 'Contact', en: 'Contact', ar: 'تواصل' },
  'landing.cta.trial': { fr: 'Essai gratuit', en: 'Free trial', ar: 'تجربة مجانية' },
  'landing.cta.login': { fr: 'Se connecter', en: 'Log in', ar: 'تسجيل الدخول' },
  'landing.cta.start': { fr: 'Commencer gratuitement', en: 'Get started free', ar: 'ابدأ مجاناً' },
  'landing.cta.demo': { fr: 'Voir une démo', en: 'Watch a demo', ar: 'شاهد عرضاً توضيحياً' },
  'landing.hero.badge': {
    fr: 'Fonctionne même sans internet',
    en: 'Works even without internet',
    ar: 'يعمل حتى بدون إنترنت',
  },
  'landing.hero.title1': { fr: 'Gérez votre boutique,', en: 'Run your shop,', ar: 'أدِر متجرك،' },
  'landing.hero.title2': {
    fr: 'même sans internet.',
    en: 'even without internet.',
    ar: 'حتى بدون إنترنت.',
  },
  'landing.hero.subtitle': {
    fr: 'Sahilley vous aide à suivre vos ventes, votre stock et vos créances — simplement, depuis votre téléphone ou votre ordinateur.',
    en: 'Sahilley helps you track your sales, inventory and receivables — simply, from your phone or computer.',
    ar: 'يساعدك Sahilley على متابعة مبيعاتك ومخزونك وديونك — ببساطة، من هاتفك أو حاسوبك.',
  },
  'landing.feat.eyebrow': {
    fr: 'Ce que fait Sahilley',
    en: 'What Sahilley does',
    ar: 'ما الذي يقدّمه Sahilley',
  },
  'landing.feat.title': {
    fr: 'Tout ce dont vous avez besoin',
    en: 'Everything you need',
    ar: 'كل ما تحتاجه',
  },
  'landing.feat.sales.title': {
    fr: 'Ventes & caisse',
    en: 'Sales & checkout',
    ar: 'المبيعات والصندوق',
  },
  'landing.feat.sales.desc': {
    fr: 'Enregistrez chaque vente en quelques secondes. Espèces, Mobile Money ou crédit — tout est tracé.',
    en: 'Record every sale in seconds. Cash, Mobile Money or credit — it’s all tracked.',
    ar: 'سجّل كل عملية بيع في ثوانٍ. نقداً أو Mobile Money أو بالآجل — كل شيء موثّق.',
  },
  'landing.feat.stock.title': {
    fr: 'Gestion de stock',
    en: 'Inventory management',
    ar: 'إدارة المخزون',
  },
  'landing.feat.stock.desc': {
    fr: 'Suivez vos quantités en temps réel. Recevez des alertes avant d’être en rupture.',
    en: 'Track quantities in real time. Get alerts before you run out.',
    ar: 'تابع كمياتك لحظياً. احصل على تنبيهات قبل نفاد المخزون.',
  },
  'landing.feat.credit.title': { fr: 'Ventes à crédit', en: 'Credit sales', ar: 'البيع بالآجل' },
  'landing.feat.credit.desc': {
    fr: 'Gardez une trace de qui vous doit quoi. Plus besoin de cahier, plus d’oublis.',
    en: 'Keep track of who owes what. No more notebooks, no more forgetting.',
    ar: 'احتفظ بسجل لمن يدين لك وبكم. لا مزيد من الدفاتر، ولا نسيان.',
  },
  'landing.feat.offline.title': {
    fr: 'Fonctionne hors-ligne',
    en: 'Works offline',
    ar: 'يعمل بدون اتصال',
  },
  'landing.feat.offline.desc': {
    fr: 'Pas d’internet ? Aucun problème. Sahilley fonctionne même sans connexion et synchronise dès que possible.',
    en: 'No internet? No problem. Sahilley works without a connection and syncs as soon as it can.',
    ar: 'لا يوجد إنترنت؟ لا مشكلة. يعمل Sahilley بدون اتصال ويزامن بمجرد توفّره.',
  },
  'landing.feat.keyPoint': { fr: 'Argument clé', en: 'Key point', ar: 'نقطة أساسية' },
  'landing.problem.eyebrow': {
    fr: 'Vous vous reconnaissez ?',
    en: 'Sound familiar?',
    ar: 'هل تجد نفسك في هذا؟',
  },
  'landing.problem.title': {
    fr: 'Le commerce, c’est déjà assez compliqué.',
    en: 'Running a shop is already hard enough.',
    ar: 'إدارة المتجر صعبة بما يكفي أصلاً.',
  },
  'landing.problem.subtitle': {
    fr: 'Sans outil adapté, vous perdez le fil. Sahilley est conçu pour vous simplifier la vie.',
    en: 'Without the right tool, you lose track. Sahilley is built to make your life simpler.',
    ar: 'بدون الأداة المناسبة، تفقد المتابعة. صُمّم Sahilley ليبسّط حياتك.',
  },
  'landing.problem.p1': {
    fr: 'Vous notez les ventes sur un cahier que vous perdez ou oubliez de remplir ?',
    en: 'You write sales in a notebook you lose or forget to fill in?',
    ar: 'هل تدوّن المبيعات في دفتر تفقده أو تنسى تعبئته؟',
  },
  'landing.problem.p2': {
    fr: 'Vous découvrez que vous êtes en rupture de stock au moment où le client est devant vous ?',
    en: 'You find out you’re out of stock right when the customer is standing there?',
    ar: 'هل تكتشف نفاد المخزون في اللحظة التي يقف فيها الزبون أمامك؟',
  },
  'landing.problem.p3': {
    fr: 'Vous ne savez plus combien de clients vous doivent de l’argent ?',
    en: 'You’ve lost track of how much your customers owe you?',
    ar: 'هل فقدت حساب المبالغ التي يدين بها زبائنك لك؟',
  },
  'landing.why.eyebrow': { fr: 'Pourquoi Sahilley ?', en: 'Why Sahilley?', ar: 'لماذا Sahilley؟' },
  'landing.why.title': {
    fr: 'Conçu pour la réalité africaine',
    en: 'Built for African realities',
    ar: 'مصمّم للواقع الأفريقي',
  },
  'landing.why.w1.title': {
    fr: 'Connexion faible ? Pas de problème.',
    en: 'Weak connection? No problem.',
    ar: 'اتصال ضعيف؟ لا مشكلة.',
  },
  'landing.why.w1.desc': {
    fr: 'Sahilley fonctionne entièrement hors-ligne et synchronise dès que la connexion revient.',
    en: 'Sahilley works fully offline and syncs as soon as the connection is back.',
    ar: 'يعمل Sahilley بالكامل بدون اتصال ويزامن بمجرد عودة الاتصال.',
  },
  'landing.why.w2.title': {
    fr: 'Mobile Money intégré',
    en: 'Mobile Money built in',
    ar: 'Mobile Money مدمج',
  },
  'landing.why.w2.desc': {
    fr: 'Orange Money, Airtel Money, Wave — enregistrez le mode de paiement exact à chaque vente.',
    en: 'Orange Money, Airtel Money, Wave — record the exact payment method on every sale.',
    ar: 'Orange Money وAirtel Money وWave — سجّل وسيلة الدفع الدقيقة في كل عملية بيع.',
  },
  'landing.why.w3.title': {
    fr: 'Francs CFA, trilingue',
    en: 'CFA francs, trilingual',
    ar: 'فرنك إفريقي، بثلاث لغات',
  },
  'landing.why.w3.desc': {
    fr: 'Interface en français, arabe et anglais. Tout est en FCFA, sans conversion inutile.',
    en: 'Interface in French, Arabic and English. Everything in FCFA, no needless conversion.',
    ar: 'واجهة بالفرنسية والعربية والإنجليزية. كل شيء بالفرنك الإفريقي، دون تحويل لا داعي له.',
  },
  'landing.pricing.eyebrow': { fr: 'Tarifs', en: 'Pricing', ar: 'الأسعار' },
  'landing.pricing.title': {
    fr: 'Simple et sans surprise',
    en: 'Simple, no surprises',
    ar: 'بسيط وبلا مفاجآت',
  },
  'landing.pricing.subtitle': {
    fr: '30 jours d’essai gratuit — aucune carte bancaire requise',
    en: '30-day free trial — no card required',
    ar: 'تجربة مجانية لمدة 30 يوماً — دون الحاجة إلى بطاقة بنكية',
  },
  'landing.pricing.popular': { fr: 'Populaire', en: 'Popular', ar: 'الأكثر رواجاً' },
  'landing.pricing.cta': { fr: 'Essayer gratuitement', en: 'Try for free', ar: 'جرّب مجاناً' },
  'landing.pricing.period': { fr: 'FCFA / mois', en: 'FCFA / month', ar: 'فرنك / شهرياً' },
  'landing.plan.solo.desc': {
    fr: 'Pour un commerçant seul',
    en: 'For a solo merchant',
    ar: 'لتاجر يعمل بمفرده',
  },
  'landing.plan.solo.i1': { fr: '1 utilisateur', en: '1 user', ar: 'مستخدم واحد' },
  'landing.plan.solo.i2': {
    fr: 'Ventes & stock illimités',
    en: 'Unlimited sales & inventory',
    ar: 'مبيعات ومخزون بلا حدود',
  },
  'landing.plan.solo.i3': {
    fr: 'Factures & proformas',
    en: 'Invoices & quotes',
    ar: 'فواتير وعروض أسعار',
  },
  'landing.plan.solo.i4': {
    fr: 'Fonctionne hors-ligne',
    en: 'Works offline',
    ar: 'يعمل بدون اتصال',
  },
  'landing.plan.solo.i5': {
    fr: 'Support WhatsApp',
    en: 'WhatsApp support',
    ar: 'دعم عبر WhatsApp',
  },
  'landing.plan.shop.desc': {
    fr: 'Pour une boutique avec employés',
    en: 'For a shop with staff',
    ar: 'لمتجر فيه موظفون',
  },
  'landing.plan.shop.i1': {
    fr: 'Jusqu’à 5 utilisateurs',
    en: 'Up to 5 users',
    ar: 'حتى 5 مستخدمين',
  },
  'landing.plan.shop.i2': {
    fr: 'Tout Solo +',
    en: 'Everything in Solo +',
    ar: 'كل ما في باقة الفرد +',
  },
  'landing.plan.shop.i3': { fr: 'Rapports avancés', en: 'Advanced reports', ar: 'تقارير متقدّمة' },
  'landing.plan.shop.i4': {
    fr: 'Gestion des rôles (Patron / Vendeur)',
    en: 'Role management (Owner / Seller)',
    ar: 'إدارة الأدوار (مالك / بائع)',
  },
  'landing.plan.shop.i5': { fr: 'Priorité support', en: 'Priority support', ar: 'أولوية في الدعم' },
  'landing.final.title': {
    fr: 'Prêt à mieux gérer votre boutique ?',
    en: 'Ready to run your shop better?',
    ar: 'هل أنت مستعد لإدارة متجرك بشكل أفضل؟',
  },
  'landing.final.subtitle': {
    fr: 'Rejoignez des centaines de commerçants qui font confiance à Sahilley chaque jour.',
    en: 'Join hundreds of merchants who rely on Sahilley every day.',
    ar: 'انضم إلى مئات التجّار الذين يثقون بـ Sahilley كل يوم.',
  },
  'landing.final.cta': {
    fr: 'Créer ma boutique gratuitement',
    en: 'Create my shop for free',
    ar: 'أنشئ متجرك مجاناً',
  },
  'landing.final.fineprint': {
    fr: 'Aucune carte requise · 30 jours gratuits · Annulation à tout moment',
    en: 'No card required · 30 days free · Cancel anytime',
    ar: 'دون بطاقة · 30 يوماً مجاناً · يمكنك الإلغاء في أي وقت',
  },
  'landing.footer.brandDesc': {
    fr: 'Logiciel de gestion de boutique pour les commerçants d’Afrique centrale. Hors-ligne, simple, trilingue.',
    en: 'Shop management software for merchants in Central Africa. Offline, simple, trilingual.',
    ar: 'برنامج لإدارة المتاجر لتجّار وسط إفريقيا. بدون اتصال، بسيط، بثلاث لغات.',
  },
  'landing.footer.col.product': { fr: 'Produit', en: 'Product', ar: 'المنتج' },
  'landing.footer.col.help': { fr: 'Aide', en: 'Help', ar: 'المساعدة' },
  'landing.footer.col.legal': { fr: 'Légal', en: 'Legal', ar: 'قانوني' },
  'landing.footer.l.download': { fr: 'Télécharger', en: 'Download', ar: 'تنزيل' },
  'landing.footer.l.updates': { fr: 'Mises à jour', en: 'Updates', ar: 'التحديثات' },
  'landing.footer.l.helpCenter': { fr: 'Centre d’aide', en: 'Help center', ar: 'مركز المساعدة' },
  'landing.footer.l.whatsapp': {
    fr: 'WhatsApp Support',
    en: 'WhatsApp support',
    ar: 'دعم WhatsApp',
  },
  'landing.footer.l.tutorials': { fr: 'Tutoriels', en: 'Tutorials', ar: 'شروحات' },
  'landing.footer.l.privacy': { fr: 'Confidentialité', en: 'Privacy', ar: 'الخصوصية' },
  'landing.footer.l.terms': {
    fr: 'Conditions d’utilisation',
    en: 'Terms of use',
    ar: 'شروط الاستخدام',
  },
  'landing.footer.copyright': {
    fr: '© 2025 Sahilley. Tous droits réservés.',
    en: '© 2025 Sahilley. All rights reserved.',
    ar: '© 2025 Sahilley. جميع الحقوق محفوظة.',
  },
  'landing.preview.today': {
    fr: 'Aujourd’hui — 15 jan 2025',
    en: 'Today — Jan 15, 2025',
    ar: 'اليوم — 15 يناير 2025',
  },
  'landing.preview.revenue': { fr: 'CA du jour', en: 'Today’s revenue', ar: 'إيراد اليوم' },
  'landing.preview.salesUnit': { fr: 'ventes', en: 'sales', ar: 'مبيعات' },
  'landing.preview.weekSales': {
    fr: 'Ventes de la semaine',
    en: 'This week’s sales',
    ar: 'مبيعات الأسبوع',
  },
  // ── Commun aux écrans ─────────────────────────────────────────────────────
  'common.search.product': {
    fr: 'Rechercher un produit...',
    en: 'Search a product...',
    ar: 'ابحث عن منتج...',
  },
  'common.search.expense': {
    fr: 'Rechercher une dépense...',
    en: 'Search an expense...',
    ar: 'ابحث عن مصروف...',
  },
  'common.search.client': {
    fr: 'Rechercher un client...',
    en: 'Search a client...',
    ar: 'ابحث عن زبون...',
  },
  'common.search.article': {
    fr: 'Rechercher un article...',
    en: 'Search an item...',
    ar: 'ابحث عن صنف...',
  },
  'common.search.document': {
    fr: 'Rechercher un document...',
    en: 'Search a document...',
    ar: 'ابحث عن مستند...',
  },
  'common.allCategories': { fr: 'Toutes catégories', en: 'All categories', ar: 'كل الفئات' },
  'common.all': { fr: 'Tous', en: 'All', ar: 'الكل' },
  'common.today': { fr: 'Aujourd’hui', en: 'Today', ar: 'اليوم' },
  'common.thisMonth': { fr: 'Ce mois', en: 'This month', ar: 'هذا الشهر' },
  'common.transactions': { fr: 'transactions', en: 'transactions', ar: 'معاملات' },
  'common.product': { fr: 'Produit', en: 'Product', ar: 'المنتج' },
  'common.qty': { fr: 'Qté', en: 'Qty', ar: 'الكمية' },
  'common.ca': { fr: 'CA', en: 'Revenue', ar: 'الإيراد' },
  'common.amount': { fr: 'Montant', en: 'Amount', ar: 'المبلغ' },
  'common.date': { fr: 'Date', en: 'Date', ar: 'التاريخ' },
  'common.category': { fr: 'Catégorie', en: 'Category', ar: 'الفئة' },
  'common.note': { fr: 'Note', en: 'Note', ar: 'ملاحظة' },
  'common.status': { fr: 'Statut', en: 'Status', ar: 'الحالة' },
  'common.total': { fr: 'Total', en: 'Total', ar: 'الإجمالي' },
  'common.fcfa': { fr: 'FCFA', en: 'FCFA', ar: 'فرنك' },
  'common.select': { fr: 'Sélectionner...', en: 'Select...', ar: 'اختر...' },
  'common.editSoonProduct': {
    fr: 'Édition de produit à venir.',
    en: 'Product editing coming soon.',
    ar: 'تعديل المنتج قريباً.',
  },
  'common.editSoonExpense': {
    fr: 'Édition de dépense à venir.',
    en: 'Expense editing coming soon.',
    ar: 'تعديل المصروف قريباً.',
  },

  // ── Stock ─────────────────────────────────────────────────────────────────
  'stock.subtitle': {
    fr: 'Gestion des produits et niveaux de stock',
    en: 'Products and stock levels',
    ar: 'إدارة المنتجات ومستويات المخزون',
  },
  'stock.kpi.totalProducts': { fr: 'Total produits', en: 'Total products', ar: 'إجمالي المنتجات' },
  'stock.kpi.refs': { fr: 'références', en: 'refs', ar: 'مراجع' },
  'stock.kpi.stockValue': { fr: 'Valeur du stock', en: 'Stock value', ar: 'قيمة المخزون' },
  'stock.kpi.low': { fr: 'Stock faible', en: 'Low stock', ar: 'مخزون منخفض' },
  'stock.kpi.out': { fr: 'Rupture de stock', en: 'Out of stock', ar: 'نفاد المخزون' },
  'stock.kpi.products': { fr: 'produits', en: 'products', ar: 'منتجات' },
  'stock.status.ok': { fr: 'En stock', en: 'In stock', ar: 'متوفّر' },
  'stock.status.low': { fr: 'Stock faible', en: 'Low stock', ar: 'مخزون منخفض' },
  'stock.status.out': { fr: 'Rupture', en: 'Out of stock', ar: 'نفد' },
  'stock.tab.all': { fr: 'Tous', en: 'All', ar: 'الكل' },
  'stock.col.ref': { fr: 'Réf.', en: 'Ref.', ar: 'المرجع' },
  'stock.col.buyPrice': { fr: 'Prix achat', en: 'Buy price', ar: 'سعر الشراء' },
  'stock.col.sellPrice': { fr: 'Prix vente', en: 'Sell price', ar: 'سعر البيع' },
  'stock.col.stock': { fr: 'Stock', en: 'Stock', ar: 'المخزون' },
  'stock.col.threshold': { fr: 'Seuil', en: 'Threshold', ar: 'الحد الأدنى' },
  'stock.empty': {
    fr: 'Aucun produit ne correspond à ces filtres.',
    en: 'No product matches these filters.',
    ar: 'لا يوجد منتج يطابق هذه المرشّحات.',
  },
  'stock.added': {
    fr: 'Produit « {name} » ajouté ({ref}).',
    en: 'Product “{name}” added ({ref}).',
    ar: 'تمت إضافة المنتج «{name}» ({ref}).',
  },
  'stock.nameRequired': {
    fr: 'Le nom du produit est requis.',
    en: 'Product name is required.',
    ar: 'اسم المنتج مطلوب.',
  },
  'stock.form.title': { fr: 'Ajouter un produit', en: 'Add a product', ar: 'إضافة منتج' },
  'stock.form.subtitle': {
    fr: 'Nouvelle référence en stock',
    en: 'New stock reference',
    ar: 'مرجع جديد في المخزون',
  },
  'stock.form.name': { fr: 'Nom du produit', en: 'Product name', ar: 'اسم المنتج' },
  'stock.form.namePlaceholder': {
    fr: 'Ex: Savon Monganga ×12',
    en: 'e.g. Monganga Soap ×12',
    ar: 'مثال: صابون Monganga ×12',
  },
  'stock.form.qtyField': { fr: 'Quantité', en: 'Quantity', ar: 'الكمية' },
  'stock.form.thresholdField': { fr: 'Seuil alerte', en: 'Alert threshold', ar: 'حد التنبيه' },
  'stock.form.submit': { fr: 'Enregistrer le produit', en: 'Save product', ar: 'حفظ المنتج' },

  // ── Dépenses ──────────────────────────────────────────────────────────────
  'depenses.subtitle': {
    fr: 'Suivi des charges et sorties d’argent',
    en: 'Track charges and cash outflows',
    ar: 'متابعة المصاريف والمدفوعات',
  },
  'depenses.kpi.totalMonth': {
    fr: 'Total ce mois',
    en: 'This month total',
    ar: 'إجمالي هذا الشهر',
  },
  'depenses.kpi.today': { fr: 'Aujourd’hui', en: 'Today', ar: 'اليوم' },
  'depenses.kpi.count': { fr: 'Transactions', en: 'Transactions', ar: 'المعاملات' },
  'depenses.kpi.countUnit': { fr: 'dépenses', en: 'expenses', ar: 'مصروفات' },
  'depenses.kpi.biggest': { fr: 'Plus grosse charge', en: 'Biggest charge', ar: 'أكبر مصروف' },
  'depenses.col.num': { fr: 'N°', en: 'No.', ar: 'رقم' },
  'depenses.col.label': { fr: 'Libellé', en: 'Label', ar: 'البيان' },
  'depenses.empty': {
    fr: 'Aucune dépense ne correspond à ces filtres.',
    en: 'No expense matches these filters.',
    ar: 'لا يوجد مصروف يطابق هذه المرشّحات.',
  },
  'depenses.added': {
    fr: 'Dépense « {label} » enregistrée ({amount} FCFA).',
    en: 'Expense “{label}” saved ({amount} FCFA).',
    ar: 'تم تسجيل المصروف «{label}» ({amount} فرنك).',
  },
  'depenses.labelRequired': {
    fr: 'Le libellé est requis.',
    en: 'Label is required.',
    ar: 'البيان مطلوب.',
  },
  'depenses.form.title': { fr: 'Ajouter une dépense', en: 'Add an expense', ar: 'إضافة مصروف' },
  'depenses.form.subtitle': {
    fr: 'Enregistrer une sortie d’argent',
    en: 'Record a cash outflow',
    ar: 'تسجيل خروج أموال',
  },
  'depenses.form.labelPlaceholder': {
    fr: 'Ex: Loyer boutique',
    en: 'e.g. Shop rent',
    ar: 'مثال: إيجار المتجر',
  },
  'depenses.form.notePlaceholder': { fr: 'Remarque...', en: 'Remark...', ar: 'ملاحظة...' },
  'depenses.form.submit': { fr: 'Enregistrer', en: 'Save', ar: 'حفظ' },

  // ── Rapports ──────────────────────────────────────────────────────────────
  'rapports.subtitle': {
    fr: 'Analyse des performances de la boutique',
    en: 'Shop performance analysis',
    ar: 'تحليل أداء المتجر',
  },
  'rapports.exportPdf': { fr: 'Exporter en PDF', en: 'Export to PDF', ar: 'تصدير PDF' },
  'rapports.exportSoon': {
    fr: 'Export PDF à venir.',
    en: 'PDF export coming soon.',
    ar: 'تصدير PDF قريباً.',
  },
  'rapports.periodLabel': { fr: 'Période :', en: 'Period:', ar: 'الفترة:' },
  'rapports.period.today': { fr: 'Aujourd’hui', en: 'Today', ar: 'اليوم' },
  'rapports.period.week': { fr: 'Semaine', en: 'Week', ar: 'الأسبوع' },
  'rapports.period.month': { fr: 'Mois', en: 'Month', ar: 'الشهر' },
  'rapports.period.year': { fr: 'Année', en: 'Year', ar: 'السنة' },
  'rapports.period.custom': { fr: 'Personnalisé', en: 'Custom', ar: 'مخصّص' },
  'rapports.kpi.revenue': { fr: 'Chiffre d’affaires', en: 'Revenue', ar: 'الإيرادات' },
  'rapports.kpi.sales': { fr: 'Ventes', en: 'Sales', ar: 'المبيعات' },
  'rapports.kpi.margin': { fr: 'Marge brute', en: 'Gross margin', ar: 'الهامش الإجمالي' },
  'rapports.kpi.netProfit': {
    fr: 'Bénéfice net estimé',
    en: 'Est. net profit',
    ar: 'صافي الربح المقدّر',
  },
  'rapports.chartTitle': { fr: 'Évolution des ventes', en: 'Sales trend', ar: 'تطوّر المبيعات' },
  'rapports.chartSub': {
    fr: 'Cette semaine · en milliers FCFA',
    en: 'This week · in thousands FCFA',
    ar: 'هذا الأسبوع · بآلاف الفرنكات',
  },
  'rapports.topProducts': { fr: 'Top produits', en: 'Top products', ar: 'أفضل المنتجات' },
  'rapports.note': {
    fr: 'Les données affichées sont basées sur les ventes enregistrées localement. La synchronisation complète avec le serveur est en attente.',
    en: 'The figures shown are based on sales recorded locally. Full sync with the server is pending.',
    ar: 'تستند الأرقام المعروضة إلى المبيعات المسجّلة محلياً. المزامنة الكاملة مع الخادم معلّقة.',
  },
  'common.article': { fr: 'Article', en: 'Item', ar: 'الصنف' },
  'method.cash': { fr: 'Espèces', en: 'Cash', ar: 'نقداً' },
  'method.mobile': { fr: 'Mobile Money', en: 'Mobile Money', ar: 'Mobile Money' },
  'method.credit': { fr: 'Crédit', en: 'Credit', ar: 'آجل' },
  'method.transfer': { fr: 'Virement', en: 'Transfer', ar: 'تحويل' },

  // ── Ventes (historique) ───────────────────────────────────────────────────
  'ventes.subtitle': {
    fr: 'Historique complet des transactions',
    en: 'Full transaction history',
    ar: 'السجل الكامل للمعاملات',
  },
  'ventes.kpi.caToday': { fr: 'CA aujourd’hui', en: 'Today’s revenue', ar: 'إيراد اليوم' },
  'ventes.kpi.salesUnit': { fr: 'ventes', en: 'sales', ar: 'مبيعات' },
  'ventes.kpi.syncPending': { fr: 'Sync en attente', en: 'Pending sync', ar: 'مزامنة معلّقة' },
  'ventes.kpi.creditSales': { fr: 'Ventes à crédit', en: 'Credit sales', ar: 'مبيعات آجلة' },
  'ventes.period.all': { fr: 'Tout l’historique', en: 'All history', ar: 'كل السجل' },
  'ventes.col.time': { fr: 'Heure', en: 'Time', ar: 'الوقت' },
  'ventes.col.payment': { fr: 'Paiement', en: 'Payment', ar: 'الدفع' },
  'ventes.col.sync': { fr: 'Sync', en: 'Sync', ar: 'المزامنة' },
  'ventes.unsynced': { fr: '{n} non synchronisées', en: '{n} not synced', ar: '{n} غير مزامَنة' },
  'ventes.empty': {
    fr: 'Aucune vente ne correspond à ces filtres.',
    en: 'No sale matches these filters.',
    ar: 'لا توجد عملية بيع تطابق هذه المرشّحات.',
  },

  // ── Créances ──────────────────────────────────────────────────────────────
  'creances.subtitle': {
    fr: 'Clients débiteurs et remboursements',
    en: 'Debtor clients and repayments',
    ar: 'الزبائن المدينون والتسديدات',
  },
  'creances.totalLabel': {
    fr: 'Total créances en cours',
    en: 'Total outstanding receivables',
    ar: 'إجمالي الديون المستحقة',
  },
  'creances.debtorCount': {
    fr: '{n} clients débiteurs',
    en: '{n} debtor clients',
    ar: '{n} زبائن مدينون',
  },
  'creances.emptySearch': {
    fr: 'Aucun client ne correspond à cette recherche.',
    en: 'No client matches this search.',
    ar: 'لا يوجد زبون يطابق هذا البحث.',
  },
  'creances.clientSince': {
    fr: 'client depuis {since}',
    en: 'client since {since}',
    ar: 'زبون منذ {since}',
  },
  'creances.recordRepayment': {
    fr: 'Enregistrer un remboursement',
    en: 'Record a repayment',
    ar: 'تسجيل تسديد',
  },
  'creances.kpi.balance': {
    fr: 'Solde restant dû',
    en: 'Outstanding balance',
    ar: 'الرصيد المتبقّي',
  },
  'creances.kpi.totalCredit': {
    fr: 'Total acheté à crédit',
    en: 'Total bought on credit',
    ar: 'إجمالي المشتريات الآجلة',
  },
  'creances.kpi.repaid': { fr: 'Déjà remboursé', en: 'Already repaid', ar: 'المسدّد' },
  'creances.history': {
    fr: 'Historique des achats à crédit',
    en: 'Credit purchase history',
    ar: 'سجل المشتريات الآجلة',
  },
  'credit.status.paid': { fr: 'Remboursé', en: 'Repaid', ar: 'مسدّد' },
  'credit.status.partial': { fr: 'Partiel', en: 'Partial', ar: 'جزئي' },
  'credit.status.credit': { fr: 'Dû', en: 'Owed', ar: 'مستحق' },
  'creances.amountInvalid': {
    fr: 'Saisis un montant supérieur à 0.',
    en: 'Enter an amount greater than 0.',
    ar: 'أدخل مبلغاً أكبر من 0.',
  },
  'creances.noDebt': {
    fr: '{name} n’a aucune dette en cours.',
    en: '{name} has no outstanding debt.',
    ar: 'لا توجد على {name} أي ديون مستحقة.',
  },
  'creances.repaymentToast': {
    fr: 'Remboursement de {amount} FCFA ({method}) enregistré pour {name}{suffix}.',
    en: 'Repayment of {amount} FCFA ({method}) recorded for {name}{suffix}.',
    ar: 'تم تسجيل تسديد بقيمة {amount} فرنك ({method}) لـ {name}{suffix}.',
  },
  'creances.form.title': {
    fr: 'Enregistrer un remboursement — {name}',
    en: 'Record a repayment — {name}',
    ar: 'تسجيل تسديد — {name}',
  },
  'creances.form.balance': {
    fr: 'Solde dû : {amount} FCFA',
    en: 'Balance due: {amount} FCFA',
    ar: 'الرصيد المستحق: {amount} فرنك',
  },
  'creances.form.amount': { fr: 'Montant reçu', en: 'Amount received', ar: 'المبلغ المستلَم' },
  'creances.form.method': { fr: 'Mode de paiement', en: 'Payment method', ar: 'وسيلة الدفع' },
  'creances.form.note': { fr: 'Note (optionnel)', en: 'Note (optional)', ar: 'ملاحظة (اختياري)' },
  'creances.form.notePlaceholder': {
    fr: 'Ex: acompte du 15 jan',
    en: 'e.g. deposit of Jan 15',
    ar: 'مثال: دفعة بتاريخ 15 يناير',
  },
  'creances.form.validate': { fr: 'Valider', en: 'Confirm', ar: 'تأكيد' },
  // ── Documents (factures & proformas) ──────────────────────────────────────
  'documents.subtitle': {
    fr: 'Factures et proformas',
    en: 'Invoices and quotes',
    ar: 'الفواتير وعروض الأسعار',
  },
  'documents.tab.factures': { fr: 'Factures', en: 'Invoices', ar: 'الفواتير' },
  'documents.tab.proformas': { fr: 'Proformas', en: 'Quotes', ar: 'عروض الأسعار' },
  'doc.status.paid': { fr: 'Payée', en: 'Paid', ar: 'مدفوعة' },
  'doc.status.pending': { fr: 'En attente', en: 'Pending', ar: 'قيد الانتظار' },
  'doc.status.credit': { fr: 'Crédit', en: 'Credit', ar: 'آجل' },
  'documents.empty': {
    fr: 'Aucun document ne correspond à ces filtres.',
    en: 'No document matches these filters.',
    ar: 'لا يوجد مستند يطابق هذه المرشّحات.',
  },
  'documents.kind.facture': { fr: 'Facture', en: 'Invoice', ar: 'فاتورة' },
  'documents.kind.proforma': { fr: 'Proforma', en: 'Quote', ar: 'عرض سعر' },
  'documents.shareWhatsapp': {
    fr: 'Partager via WhatsApp',
    en: 'Share via WhatsApp',
    ar: 'المشاركة عبر WhatsApp',
  },
  'documents.shareSoon': {
    fr: 'Partage WhatsApp à venir.',
    en: 'WhatsApp sharing coming soon.',
    ar: 'المشاركة عبر WhatsApp قريباً.',
  },
  'documents.print': { fr: 'Imprimer', en: 'Print', ar: 'طباعة' },
  'documents.printSoon': {
    fr: 'Impression à venir.',
    en: 'Printing coming soon.',
    ar: 'الطباعة قريباً.',
  },
  'documents.preview.invoiceTitle': { fr: 'FACTURE', en: 'INVOICE', ar: 'فاتورة' },
  'documents.preview.proformaTitle': { fr: 'PROFORMA', en: 'QUOTE', ar: 'عرض سعر' },
  'documents.preview.branch': { fr: 'Boutique principale', en: 'Main shop', ar: 'المتجر الرئيسي' },
  'documents.preview.dateLabel': { fr: 'Date :', en: 'Date:', ar: 'التاريخ:' },
  'documents.preview.validity': {
    fr: 'Validité : 30 jours',
    en: 'Valid: 30 days',
    ar: 'صالح لمدة 30 يوماً',
  },
  'documents.preview.billedTo': { fr: 'FACTURÉ À', en: 'BILLED TO', ar: 'فاتورة إلى' },
  'documents.preview.recipient': { fr: 'DESTINATAIRE', en: 'RECIPIENT', ar: 'المرسَل إليه' },
  'documents.preview.pu': { fr: 'P.U.', en: 'Unit price', ar: 'سعر الوحدة' },
  'documents.preview.subtotal': { fr: 'Sous-total', en: 'Subtotal', ar: 'المجموع الفرعي' },
  'documents.preview.totalEstimated': {
    fr: 'Total estimé',
    en: 'Estimated total',
    ar: 'الإجمالي المقدّر',
  },
  'documents.preview.invoiceFooter': {
    fr: 'Merci pour votre achat. — Sahilley',
    en: 'Thank you for your purchase. — Sahilley',
    ar: 'شكراً لشرائك. — Sahilley',
  },
  'documents.preview.proformaFooter': {
    fr: 'Ce document est un devis. Il ne constitue pas une facture définitive. — Sahilley',
    en: 'This document is a quote. It is not a final invoice. — Sahilley',
    ar: 'هذا المستند عرض سعر وليس فاتورة نهائية. — Sahilley',
  },
  'common.save': { fr: 'Enregistrer', en: 'Save', ar: 'حفظ' },
  'role.vendeur': { fr: 'Vendeur', en: 'Seller', ar: 'بائع' },
  'role.gerant': { fr: 'Gérant', en: 'Manager', ar: 'مدير' },

  // ── Paramètres ────────────────────────────────────────────────────────────
  'parametres.subtitle': {
    fr: 'Configuration de la boutique',
    en: 'Shop configuration',
    ar: 'إعداد المتجر',
  },
  'parametres.section.boutique': { fr: 'Boutique', en: 'Shop', ar: 'المتجر' },
  'parametres.section.facturation': { fr: 'Facturation', en: 'Billing', ar: 'الفوترة' },
  'parametres.section.devise': { fr: 'Devise', en: 'Currency', ar: 'العملة' },
  'parametres.section.langue': { fr: 'Langue', en: 'Language', ar: 'اللغة' },
  'parametres.section.utilisateurs': { fr: 'Utilisateurs', en: 'Users', ar: 'المستخدمون' },
  'parametres.section.mobile-money': { fr: 'Mobile Money', en: 'Mobile Money', ar: 'Mobile Money' },
  'parametres.section.sync': { fr: 'Synchronisation', en: 'Sync', ar: 'المزامنة' },
  'parametres.soon': {
    fr: 'Cette section arrive bientôt.',
    en: 'This section is coming soon.',
    ar: 'هذا القسم قريباً.',
  },
  'parametres.addUserSoon': {
    fr: 'Ajout d’utilisateur à venir.',
    en: 'Adding a user coming soon.',
    ar: 'إضافة مستخدم قريباً.',
  },
  'parametres.editUserSoon': {
    fr: 'Modifier {name} — à venir.',
    en: 'Edit {name} — coming soon.',
    ar: 'تعديل {name} — قريباً.',
  },
  'parametres.savedToast': {
    fr: 'Informations de la boutique enregistrées.',
    en: 'Shop info saved.',
    ar: 'تم حفظ معلومات المتجر.',
  },
  'parametres.logoSoon': {
    fr: 'Changement de logo à venir.',
    en: 'Logo change coming soon.',
    ar: 'تغيير الشعار قريباً.',
  },
  'parametres.info.title': {
    fr: 'Informations de la boutique',
    en: 'Shop information',
    ar: 'معلومات المتجر',
  },
  'parametres.info.subtitle': {
    fr: 'Ces informations apparaissent sur vos factures',
    en: 'This information appears on your invoices',
    ar: 'تظهر هذه المعلومات على فواتيرك',
  },
  'parametres.logo.title': { fr: 'Logo de la boutique', en: 'Shop logo', ar: 'شعار المتجر' },
  'parametres.logo.hint': {
    fr: 'PNG ou JPG, max 1 Mo',
    en: 'PNG or JPG, max 1 MB',
    ar: 'PNG أو JPG، بحد أقصى 1 ميغابايت',
  },
  'parametres.logo.change': { fr: 'Changer le logo', en: 'Change logo', ar: 'تغيير الشعار' },
  'parametres.field.name': { fr: 'Nom de la boutique', en: 'Shop name', ar: 'اسم المتجر' },
  'parametres.field.phone': { fr: 'Numéro de téléphone', en: 'Phone number', ar: 'رقم الهاتف' },
  'parametres.field.city': { fr: 'Ville', en: 'City', ar: 'المدينة' },
  'parametres.field.address': {
    fr: 'Quartier / Adresse',
    en: 'Neighborhood / Address',
    ar: 'الحي / العنوان',
  },
  'parametres.field.addressPlaceholder': {
    fr: 'Ex: Marché central, stand 14',
    en: 'e.g. Central market, stall 14',
    ar: 'مثال: السوق المركزي، محل 14',
  },
  'parametres.field.note': {
    fr: 'Note de bas de facture',
    en: 'Invoice footer note',
    ar: 'ملاحظة أسفل الفاتورة',
  },
  'parametres.field.notePlaceholder': {
    fr: 'Ex: Merci pour votre achat. Aucun remboursement après 48h.',
    en: 'e.g. Thank you for your purchase. No refunds after 48h.',
    ar: 'مثال: شكراً لشرائك. لا استرجاع بعد 48 ساعة.',
  },
  'parametres.users.title': { fr: 'Utilisateurs', en: 'Users', ar: 'المستخدمون' },
  'parametres.users.subtitle': {
    fr: 'Gérez les accès et les rôles',
    en: 'Manage access and roles',
    ar: 'إدارة الوصول والأدوار',
  },
  'parametres.users.add': { fr: 'Ajouter un utilisateur', en: 'Add a user', ar: 'إضافة مستخدم' },
  'parametres.users.email': {
    fr: 'Email du membre',
    en: 'Member email',
    ar: 'بريد العضو الإلكتروني',
  },
  'parametres.users.submit': { fr: 'Ajouter', en: 'Add', ar: 'إضافة' },
  'parametres.users.cancel': { fr: 'Annuler', en: 'Cancel', ar: 'إلغاء' },
  'parametres.users.remove': { fr: 'Retirer', en: 'Remove', ar: 'إزالة' },
  'parametres.users.empty': {
    fr: 'Aucun autre membre pour le moment.',
    en: 'No other members yet.',
    ar: 'لا يوجد أعضاء آخرون بعد.',
  },
  'parametres.users.loadError': {
    fr: 'Impossible de charger l’équipe.',
    en: 'Could not load the team.',
    ar: 'تعذر تحميل الفريق.',
  },
  'parametres.users.added': { fr: 'Membre ajouté.', en: 'Member added.', ar: 'تمت إضافة العضو.' },
  'parametres.users.removed': {
    fr: 'Membre retiré.',
    en: 'Member removed.',
    ar: 'تمت إزالة العضو.',
  },
  'parametres.users.roleUpdated': {
    fr: 'Rôle mis à jour.',
    en: 'Role updated.',
    ar: 'تم تحديث الدور.',
  },
  'parametres.users.errNotRegistered': {
    fr: 'Cet email n’a pas encore de compte Sahilley.',
    en: 'This email has no Sahilley account yet.',
    ar: 'هذا البريد ليس له حساب بعد.',
  },
  'parametres.users.errAlready': {
    fr: 'Cet utilisateur est déjà membre.',
    en: 'This user is already a member.',
    ar: 'هذا المستخدم عضو بالفعل.',
  },
  'parametres.users.errLastOwner': {
    fr: 'Impossible : c’est le dernier propriétaire.',
    en: 'Cannot: this is the last owner.',
    ar: 'غير ممكن: هذا آخر مالك.',
  },
  'parametres.you': { fr: 'Vous', en: 'You', ar: 'أنت' },
  'common.subtotal': { fr: 'Sous-total', en: 'Subtotal', ar: 'المجموع الفرعي' },
  'common.loading': { fr: 'Chargement…', en: 'Loading…', ar: 'جارٍ التحميل…' },

  // ── Vendre (POS) ──────────────────────────────────────────────────────────
  'pos.subtitle': {
    fr: 'Mercredi 15 janvier 2025 · 15:51',
    en: 'Wednesday, January 15, 2025 · 15:51',
    ar: 'الأربعاء 15 يناير 2025 · 15:51',
  },
  'pos.empty': {
    fr: 'Aucun article ne correspond à « {q} ».',
    en: 'No item matches “{q}”.',
    ar: 'لا يوجد صنف يطابق «{q}».',
  },
  'pos.cart': { fr: 'Panier', en: 'Cart', ar: 'السلة' },
  'pos.items': { fr: '{n} articles', en: '{n} items', ar: '{n} أصناف' },
  'pos.addHint': {
    fr: 'Cliquez sur un article pour l’ajouter',
    en: 'Tap an item to add it',
    ar: 'انقر على صنف لإضافته',
  },
  'pos.clientLabel': { fr: 'Client : {name}', en: 'Client: {name}', ar: 'الزبون: {name}' },
  'pos.clientRequired': {
    fr: 'Client débiteur requis',
    en: 'Debtor client required',
    ar: 'يلزم زبون مدين',
  },
  'pos.newClient': { fr: '+ Nouveau client', en: '+ New client', ar: '+ زبون جديد' },
  'pos.newClientSoon': {
    fr: 'Création de client à venir.',
    en: 'Creating a client coming soon.',
    ar: 'إنشاء زبون قريباً.',
  },
  'pos.validate': { fr: 'Valider la vente', en: 'Confirm sale', ar: 'تأكيد البيع' },
  'pos.cartEmpty': { fr: 'Le panier est vide.', en: 'Cart is empty.', ar: 'السلة فارغة.' },
  'pos.creditNeedsClient': {
    fr: 'Sélectionnez un client débiteur pour une vente à crédit.',
    en: 'Select a debtor client for a credit sale.',
    ar: 'اختر زبوناً مديناً للبيع الآجل.',
  },
  'pos.saleRecorded': {
    fr: 'Vente enregistrée — {amount} FCFA (démo).',
    en: 'Sale recorded — {amount} FCFA (demo).',
    ar: 'تم تسجيل البيع — {amount} فرنك (تجريبي).',
  },
  'cart.perUnit': { fr: '/ unité', en: '/ unit', ar: '/ للوحدة' },
  'cart.decrease': { fr: 'Diminuer', en: 'Decrease', ar: 'إنقاص' },
  'cart.increase': { fr: 'Augmenter', en: 'Increase', ar: 'زيادة' },
  'cart.remove': { fr: 'Retirer', en: 'Remove', ar: 'إزالة' },
  // ── Tableau de bord ───────────────────────────────────────────────────────
  'dash.date': {
    fr: 'Mercredi 15 janvier 2025',
    en: 'Wednesday, January 15, 2025',
    ar: 'الأربعاء 15 يناير 2025',
  },
  'dash.kpi.revenue': { fr: 'CA du jour', en: 'Today’s revenue', ar: 'إيراد اليوم' },
  'dash.kpi.salesToday': { fr: 'Ventes aujourd’hui', en: 'Sales today', ar: 'مبيعات اليوم' },
  'dash.kpi.receivables': {
    fr: 'Créances en cours',
    en: 'Outstanding receivables',
    ar: 'الديون المستحقة',
  },
  'dash.kpi.expensesToday': { fr: 'Dépenses du jour', en: 'Today’s expenses', ar: 'مصروفات اليوم' },
  'dash.vsYesterday': { fr: 'vs hier', en: 'vs yesterday', ar: 'مقارنةً بالأمس' },
  'dash.weekSub': {
    fr: 'En FCFA — 7 derniers jours',
    en: 'In FCFA — last 7 days',
    ar: 'بالفرنك — آخر 7 أيام',
  },
  'dash.stockAlerts': { fr: 'Alertes stock', en: 'Stock alerts', ar: 'تنبيهات المخزون' },
  'dash.seeAllStock': { fr: 'Voir tout le stock', en: 'See all inventory', ar: 'عرض كل المخزون' },
  'dash.recentSales': { fr: 'Ventes récentes', en: 'Recent sales', ar: 'المبيعات الأخيرة' },
  'dash.pendingSync': {
    fr: '{n} en attente de sync',
    en: '{n} pending sync',
    ar: '{n} بانتظار المزامنة',
  },
  'dash.seeAll': { fr: 'Voir toutes', en: 'See all', ar: 'عرض الكل' },
  'dash.weekTitle': { fr: 'Ventes de la semaine', en: 'This week’s sales', ar: 'مبيعات الأسبوع' },
  // i18n:append-here (ne pas supprimer — point d'insertion des écrans)
};

export function translate(
  locale: Locale,
  key: string,
  vars?: Record<string, string | number>,
): string {
  const entry = messages[key];
  let out: string;
  if (!entry) out = key;
  else if (locale === 'en') out = entry.en;
  else if (locale === 'ar') out = entry.ar ?? entry.fr;
  else out = entry.fr;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      out = out.split(`{${k}}`).join(String(v));
    }
  }
  return out;
}
