const ar = {
  brand: {
    aiWorkspace: "مساحة عمل للذكاء الاصطناعي",
    tagline: "مساحة عمل خاصة للذكاء الاصطناعي مخصصة لفرق الهندسة"
  },
  language: {
    label: "اللغة",
    english: "English",
    arabic: "العربية"
  },
  common: {
    workspace: "مساحة العمل",
    profile: "الملف الشخصي",
    admin: "الإدارة",
    account: "الحساب",
    runtime: "بيئة التشغيل",
    chat: "المحادثة",
    documents: "المستندات",
    agents: "الوكلاء",
    memory: "الذاكرة",
    tasks: "المهام",
    security: "الأمان",
    save: "حفظ",
    delete: "حذف",
    refresh: "تحديث",
    apply: "تطبيق",
    accept: "قبول",
    send: "إرسال",
    signIn: "تسجيل الدخول",
    new: "جديد",
    pending: "قيد الانتظار",
    unavailable: "غير متاح",
    close: "إغلاق",
    open: "فتح",
    selected: "{count} محدد",
    totalThreads: "{count} محادثة",
    status: {
      ready: "جاهز",
      responding: "يستجيب",
      offline: "غير متصل",
      completed: "مكتمل",
      running: "قيد التنفيذ",
      failed: "فشل",
      skipped: "تم التجاوز",
      started: "بدأ",
      queued: "في قائمة الانتظار",
      pending: "قيد الانتظار"
    }
  },
  login: {
    badge: "بنية تحتية خاصة للذكاء الاصطناعي",
    headlineLine1: "بنية تحتية خاصة",
    headlineLine2: "للذكاء الاصطناعي لفرق الهندسة",
    description:
      "انشر النماذج، وشغّل الوكلاء، وأدر المعرفة، وأتمت سير العمل بالكامل داخل بيئتك الخاصة.",
    accessBadge: "وصول آمن إلى مساحة العمل",
    welcomeBack: "مرحباً بعودتك",
    accessDescription: "سجّل الدخول للوصول إلى مساحة عمل Cognexa.",
    accessHelper: "استخدم بيانات اعتماد مساحة العمل للمتابعة إلى بيئة الذكاء الاصطناعي الخاصة بك.",
    protectedNotice:
      "محمي بمصادقة على مستوى مساحة العمل وتحكم في الوصول قائم على الأدوار.",
    trust: {
      privateDeployment: "نشر خاص",
      bilingual: "العربية + English",
      rbac: "صلاحيات حسب الدور"
    },
    features: {
      agents: {
        title: "وكلاء الذكاء الاصطناعي",
        description:
          "شغّل تدفقات عمل الوكلاء مع تفكير منظم وأدوات وتنفيذ مضبوط."
      },
      knowledge: {
        title: "معرفة مؤسسية",
        description:
          "أسنِد المحادثات والمهام إلى المستندات الداخلية والاسترجاع والذاكرة."
      },
      models: {
        title: "نماذج محلية",
        description:
          "انشر بنية تحتية خاصة للنماذج داخل بيئتك وسياساتك الخاصة."
      }
    }
  },
  authForm: {
    usernameLabel: "اسم المستخدم أو البريد الإلكتروني",
    usernamePlaceholder: "أدخل اسم المستخدم أو البريد الإلكتروني",
    workspaceLabel: "مساحة العمل",
    workspacePlaceholder: "اسم مساحة العمل أو المعرف المختصر",
    workspaceHelper: "اختياري. افتح مساحة عمل محددة مباشرة بعد تسجيل الدخول.",
    recentWorkspaces: "آخر مساحات العمل",
    workspaceFallbackNotice:
      "لم يتم العثور على مساحة العمل '{workspace}' في هذا الحساب. سيتم فتح مساحة العمل الافتراضية بدلاً منها.",
    passwordLabel: "كلمة المرور",
    passwordPlaceholder: "أدخل كلمة المرور",
    rememberMe: "تذكرني",
    rememberedHint: "ستظل الجلسة متاحة على هذا الجهاز.",
    sessionOnlyHint: "ستنتهي الجلسة عند إغلاق هذه الجلسة من المتصفح.",
    forgotPassword: "نسيت كلمة المرور",
    forgotPasswordSupport:
      "إعادة تعيين كلمات المرور تتم بواسطة مسؤول مساحة العمل في هذا النشر.",
    signingIn: "جارٍ تسجيل الدخول...",
    signIn: "تسجيل الدخول",
    authFailed: "فشل التحقق من الهوية.",
    capsLockOn: "زر Caps Lock مفعل.",
    showPassword: "إظهار كلمة المرور",
    hidePassword: "إخفاء كلمة المرور"
  },
  loginHelp: {
    title: "نصائح للمشغّل",
    enter: "اضغط Enter للإرسال",
    tab: "استخدم Tab للتنقل بين الحقول",
    language: "استخدم EN / ع لتغيير لغة الواجهة"
  },
  home: {
    redirecting: "جارٍ التحويل",
    preparing: "جارٍ التحضير",
    openingSecureSignIn: "فتح شاشة الدخول الآمنة",
    connecting: "جارٍ الاتصال بـ Cognexa",
    redirectDescription:
      "لم يتم العثور على جلسة نشطة، لذلك يتم توجيهك إلى شاشة تسجيل الدخول.",
    preparingDescription:
      "يتم تحميل جلسة مساحة العمل والتحقق مما إذا كان الوصول الآمن متاحاً بالفعل في هذا المتصفح."
  },
  sidebar: {
    workspaceTitle: "مساحة العمل",
    noWorkspaceSelected: "لا توجد مساحة عمل محددة",
    noOrganizationContext: "لا يوجد سياق للمؤسسة",
    newChat: "محادثة جديدة",
    conversations: "المحادثات",
    emptyConversations:
      "ابدأ محادثة جديدة لتحويل مساحة العمل هذه إلى سلسلة هندسية مرتبطة بالذاكرة والأدوات وسجل المهام.",
    deleteConversation: "حذف {title}",
    updatedAt: "{provider} / {date}"
  },
  workspacePanel: {
    workspaceSettings: "إعدادات مساحة العمل",
    workspaceDescription:
      "بدّل بين مساحات العمل، وأدر الدعوات، وتعامل مع عمليات الأعضاء.",
    profileDescription:
      "راجع سياق الحساب وسجّل الخروج دون مغادرة مساحة العمل.",
    closeWorkspaceSettings: "إغلاق إعدادات مساحة العمل",
    switchWorkspace: "تبديل مساحة العمل",
    newWorkspace: "مساحة عمل جديدة",
    inviteMember: "دعوة عضو",
    invitations: "الدعوات",
    invitationsDescription: "طلبات الوصول المعلقة المتاحة لهذا الحساب.",
    noPendingInvitations: "لا توجد دعوات معلقة.",
    noOrganizationContext: "لا يوجد سياق مؤسسة متاح.",
    admin: "الإدارة",
    logout: "تسجيل الخروج",
    workspaceUnavailable: "لا توجد مساحة عمل محددة"
  },
  workspace: {
    bootstrapping: "جارٍ التهيئة",
    connectingTitle: "جارٍ ربط Cognexa",
    connectingDescription:
      "يتم تحميل الجلسة، وفهرس النماذج، والأدوات، والذاكرة، والمحادثات.",
    authRequired: "يتطلب التحقق",
    signInBeforeUsing: "سجّل الدخول قبل استخدام Cognexa",
    signInDescription:
      "المحادثات الحية والذاكرة والموفرون والأدوات تتطلب جلسة موثقة.",
    goToLogin: "الانتقال إلى تسجيل الدخول",
    noToolsSelected: "اختر أداة واحدة على الأقل قبل تشغيل مهمة وكيل.",
    noModelAvailable: "لا يوجد نموذج محلي مثبت للموفر '{provider}'.",
    deleteConversationConfirm:
      'حذف "{title}"؟ سيؤدي ذلك إلى إزالة رسائلها نهائياً.',
    conversationNotFound: "المحادثة غير موجودة.",
    initializeFailed: "فشل تهيئة مساحة العمل.",
    loadMessagesFailed: "فشل تحميل رسائل المحادثة.",
    refreshTaskFailed: "فشل تحديث المهمة قيد التشغيل.",
    loadTaskFailed: "فشل تحميل تفاصيل المهمة.",
    refreshTasksFailed: "فشل تحديث مهام الوكلاء.",
    deleteConversationFailed: "فشل حذف المحادثة.",
    agentExecutionFailed: "فشل تنفيذ الوكيل.",
    switchWorkspaceFailed: "فشل تبديل مساحة العمل.",
    createWorkspaceFailed: "فشل إنشاء مساحة العمل.",
    inviteMemberFailed: "فشل دعوة العضو.",
    acceptInvitationFailed: "فشل قبول الدعوة.",
    sendMessageFailed: "فشل إرسال الرسالة.",
    taskLoadFailed: "فشل تحميل مهام الوكلاء.",
    workspaceNamePrompt: "اسم مساحة العمل",
    organizationNamePrompt: "اسم المؤسسة (اختياري)",
    inviteEmailPrompt: "البريد الإلكتروني للعضو",
    inviteRolePrompt: "دور مساحة العمل: مالك أو مدير أو عضو أو مشاهد",
    invitationCreated: "تم إنشاء دعوة لـ {email}.{tokenNotice}",
    taskTitleFallback: "مهمة وكيل",
    conversationTitleFallback: "محادثة جديدة",
    mobileMenu: "القائمة",
    mobileWorkspace: "مساحة العمل",
    workspaceLabel: "مساحة العمل"
  },
  chat: {
    startTaskTitle: "ابدأ بمهمة هندسية واضحة.",
    startTaskDescription:
      "اسأل عن قاعدة الكود، أو الملفات المرفوعة، أو سياق الذاكرة، أو استخدم تبويبات مساحة العمل لفحص الوكلاء والمهام وعمليات الأمان.",
    starterCards: {
      security: {
        eyebrow: "مراجعة أمنية",
        title: "تدقيق حدود المصادقة والجلسات",
        body: "تتبّع تسجيل الدخول، وتحديث الجلسة، وترويسات مساحة العمل، والمسارات المحمية من الواجهة إلى الخلفية."
      },
      documents: {
        eyebrow: "المستندات",
        title: "فحص مسارات الاسترجاع والاستيعاب",
        body: "ارسم خريطة لتحليل المستندات والتخزين المتجهي وسلوك الاسترجاع عبر المنظومة."
      },
      agents: {
        eyebrow: "عمليات الوكلاء",
        title: "شغّل مهمة مساحة عمل",
        body: "استخدم تبويبات مساحة العمل لتشغيل الأدوات وفحص الذاكرة ومراجعة آثار المهام المحفوظة."
      }
    },
    assistant: "المساعد",
    you: "أنت",
    thinking: "جارٍ التفكير...",
    modelUnassigned: "لم يتم تعيين نموذج",
    personalWorkspace: "مساحة عمل شخصية"
  },
  composer: {
    runtime: "بيئة التشغيل",
    providerNotInstalled: "{provider} (غير مثبت)",
    noInstalledModels: "لا توجد نماذج مثبتة",
    placeholder: "اطلب من Cognexa فحص الكود أو الذاكرة أو الأدوات أو سياق الاسترجاع",
    responding: "جارٍ الاستجابة...",
    send: "إرسال",
    enterToSend: "اضغط Enter للإرسال، وShift + Enter لسطر جديد.",
    autoExpand: "يتم التمدد تلقائياً حتى 200 بكسل.",
    noLocalModels: "لا توجد نماذج محلية مثبتة للموفر '{provider}'."
  },
  documents: {
    title: "مساحة المستندات",
    headline: "يبقى الاسترجاع وتحليل المستندات مرتبطين بمساحة العمل النشطة.",
    description:
      "يوفّر Cognexa بالفعل بنية للاستيعاب والتضمينات والاسترجاع المحفوظ. استخدم المحادثة للتحليل السريع أو مهام الوكلاء للتحقيقات متعددة الخطوات.",
    pipeline: "خط المعالجة",
    pipelineDescription:
      "الرفع والتحليل والتقسيم والتضمينات والتخزين المتجهي كلها ممثلة في المنظومة الحالية.",
    runtime: "بيئة التشغيل",
    runtimeDescription: "النموذج النشط: {provider} / {model}",
    toolSurfaces: "أسطح الأدوات",
    toolSurfacesDescription: "تتوفر {count} أداة موجهة للمستندات في مساحة العمل هذه.",
    inventory: "جرد الأدوات",
    noTools: "لا توجد حالياً أدوات استرجاع معروضة في الواجهة."
  },
  agents: {
    console: "وحدة تحكم الوكلاء",
    headline: "شغّل مهام مدعومة بالأدوات على مساحة العمل الحالية.",
    description:
      "هذه هي واجهة التنفيذ للتحقيقات القابلة للتكرار والفحوصات الهندسية والتحليل على مستوى مساحة العمل.",
    placeholder:
      "لخّص خط RAG، أو افحص تدفق المصادقة في المستودع، أو راجع آثار المهام.",
    enabledTools: "الأدوات المفعلة",
    runTask: "تشغيل المهمة",
    runningTask: "جارٍ تشغيل المهمة",
    refreshTasks: "تحديث المهام",
    recentRuns: "آخر العمليات",
    noRuns: "لا توجد عمليات وكلاء محفوظة بعد.",
    persistedRuns: "توجد {count} عملية محفوظة.",
    populateHistory: "شغّل هدفاً لملء سجل المهام في مساحة العمل.",
    activeTrace: "الأثر النشط",
    selectTask: "اختر مهمة لعرض تفاصيلها في تبويب المهام.",
    openTrace: "افتح الأثر الكامل للمهمة لفحص الخطوات والمنطق وتنفيذ الأدوات.",
    toolAssistedTask: "مهمة مساحة عمل مدعومة بالأدوات"
  },
  memory: {
    preferences: "التفضيلات",
    preferencesDescription: "تفضيلات ثابتة للمشغّل وسلوك خاص بمساحة العمل.",
    longTerm: "الذاكرة طويلة المدى",
    longTermDescription: "معرفة محفوظة تنتقل بين المحادثات.",
    shortTerm: "السياق قصير المدى",
    shortTermDescription: "سياق المحادثات الأخيرة الذي يغذي مساحة العمل الحالية.",
    noEntries: "لا توجد عناصر {section} بعد."
  },
  tasks: {
    title: "الجدول الزمني للمهام",
    headline: "افحص آثار المهام المحفوظة والمنطق وحالة تنفيذ الأدوات.",
    description:
      "كل عملية لوكيل تسجل بيانات تنفيذ خطوة بخطوة حتى تتمكن الفرق من مراجعة النتائج دون إعادة فتح المحادثة الأصلية.",
    noTasks: "لا يوجد سجل مهام متاح لمساحة العمل هذه بعد.",
    detailTitle: "تفاصيل المهمة",
    selectTask: "اختر مهمة من القائمة لفحص أثرها.",
    overview: "نظرة عامة",
    summaryFallback: "لم يتم حفظ ملخص نهائي لهذه المهمة.",
    steps: "الخطوات",
    reasoningLog: "سجل المنطق",
    noReasoning: "لا يوجد سجل منطق محفوظ لهذه العملية.",
    toolExecutions: "تنفيذات الأدوات",
    noToolExecutions: "لم يتم إرفاق أي تنفيذات أدوات محفوظة بهذه المهمة.",
    tool: "الأداة",
    input: "المدخلات",
    output: "المخرجات",
    fromTo: "{from} إلى {to}"
  },
  security: {
    governance: "حوكمة مساحة العمل",
    headline: "حافظ على الوصول وبيئة التشغيل وعمليات المهام ضمن مساحة العمل النشطة.",
    description:
      "تعيش إدارة مساحة العمل الآن داخل لوحة إعدادات مخصصة حتى تبقى المحادثة والمهام أكثر وضوحاً.",
    role: "الدور",
    invitations: "الدعوات",
    invitationsPending: "{count} معلقة",
    status: "الحالة",
    currentWorkspace: "مساحة العمل الحالية",
    activeConversation: "المحادثة النشطة: {title} / {count} محادثة",
    runtimeAccess: "بيئة التشغيل والوصول",
    currentModel: "النموذج الحالي",
    openWorkspaceSettings: "فتح إعدادات مساحة العمل",
    openProfilePanel: "فتح لوحة الملف الشخصي",
    openAdminConsole: "فتح وحدة الإدارة",
    accountContext: "سياق الحساب"
  },
  admin: {
    dashboard: "لوحة الإدارة",
    headline: "حوكمة سياسات الذكاء الاصطناعي ومراقبة التشغيل",
    description:
      "أدر السياسات المقيّدة بالنطاق، وبدّل أوضاع مساحة العمل، واختبر نتائج القواعد، وراجع كل قرار سياسة دون إضعاف المصادقة أو التحكم في الوصول."
  },
  authorizedTesting: {
    label: "الاختبار المصرح به",
    title: "شغّل اختبارات أمنية نشطة ومقيدة بعد التحقق",
    description:
      "أنشئ تحدي إثبات ملكية للنطاق، وتحقق من اسم المضيف العام، ثم شغّل فحوصات نشطة محكومة تبقى قابلة للعكس وقابلة للتدقيق.",
    navLabel: "الاختبار المصرح به",
    launchDescription:
      "افتح مختبر الاختبار النشط المصرح به في شاشة مستقلة للتحقق من الملكية وتشغيل الفحوصات الآمنة ومراجعة السجل.",
    screenTitle: "مختبر الاختبار الأمني المصرح به",
    screenDescription:
      "يعمل هذا المختبر في شاشة إدارة مستقلة حتى يبقى التحقق من النطاق والاختبارات النشطة المحكومة ومراجعة السجل منفصلة عن الفحص السلبي وتحرير السياسات.",
    boundaryTitle: "الضوابط",
    boundaryDescription:
      "يختبر هذا المختبر أسماء المضيف العامة التي تم التحقق منها فقط، ويبقى على نفس الأصل، ويقتصر على طلبات GET وHEAD وOPTIONS الآمنة. لا يجرب كلمات المرور، ولا يغير البيانات، ولا يثبت حمولات.",
    verificationTitle: "التحقق من الملكية",
    verificationDescription:
      "ابدأ بتحدي DNS TXT أو ملف HTTP أو وسم HTML meta حتى يتمكن النظام من تأكيد أن النطاق يتبع لمؤسستك قبل بدء أي اختبار نشط.",
    readOnlyTitle: "تنفيذ للقراءة فقط",
    readOnlyDescription:
      "يعيد الاختبار النشط استخدام الخط الأساسي السلبي، ويخطط لفحوصات آمنة، ويسجل كل طلب ونتيجة وسلسلة نمذجة للمراجعة اللاحقة.",
    startFresh: "ابدأ من جديد",
    refresh: "تحديث النشاط",
    refreshFailed: "فشل تحديث نشاط الاختبار المصرح به.",
    targetLabel: "رابط الهدف",
    targetPlaceholder: "https://app.example.com",
    targetRequired: "أدخل رابط هدف عام ومتحقق منه قبل المتابعة.",
    methodLabel: "طريقة التحقق",
    challengeSetup: "إعداد التحدي",
    createChallenge: "إنشاء التحدي",
    creatingChallenge: "جارٍ إنشاء التحدي...",
    challengeToken: "رمز التحدي",
    verificationFailed: "فشل إنشاء تحدي إثبات الملكية.",
    verificationCheckFailed: "فشل التحقق من تحدي الملكية.",
    verificationSelectionRequired: "اختر تحدي ملكية متحققاً منه قبل بدء التشغيل.",
    verificationRequiredHint:
      "اختر عملية تحقق وتأكد من أنها مكتملة قبل تشغيل الفحوصات النشطة.",
    verifiedReady: "تم التحقق من اسم المضيف المحدد وهو جاهز لتشغيل محكوم.",
    verifiedHostname: "اسم المضيف المتحقق منه",
    selectedVerification: "التحقق المحدد",
    selectVerification: "اختر عملية تحقق",
    recentVerifications: "عمليات التحقق الأخيرة",
    noVerifications: "لم يتم إنشاء أي تحديات ملكية بعد.",
    useVerification: "استخدم التحقق",
    checkStatus: "تحقق من الحالة",
    checking: "جارٍ التحقق...",
    expiresAt: "ينتهي",
    verifiedAt: "تم التحقق",
    challengeInstructions: "تعليمات التحدي",
    runConfig: "إعدادات التشغيل",
    startRun: "ابدأ تشغيلًا محكومًا",
    run: "تشغيل الاختبار",
    running: "جارٍ التشغيل...",
    runFailed: "فشل تشغيل الاختبار المصرح به.",
    reportLoadFailed: "فشل تحميل تقرير الاختبار المحدد.",
    modulesLabel: "وحدات الاختبار",
    moduleSelectionRequired: "اختر وحدة اختبار نشط واحدة على الأقل.",
    maxPages: "الحد الأقصى للصفحات",
    maxRequests: "الحد الأقصى للطلبات",
    includeProfiles: "تضمين ملفات تعريف صلاحيات للمقارنة",
    profileDescription:
      "اختياري. زوّد سياق طلب منخفض الصلاحية وعالي الصلاحية بصيغة JSON باستخدام كائني `headers` و`cookies` حتى يتمكن المختبر من مقارنة سلوك التفويض بأمان.",
    lowPrivilegeProfile: "JSON لملف الصلاحية المنخفضة",
    highPrivilegeProfile: "JSON لملف الصلاحية العالية",
    profileJsonObjectError: "يجب أن يكون JSON الخاص بملف الصلاحيات كائنًا.",
    profileJsonStringMapError:
      "يجب أن تكون قيم headers وcookies كائنات نص-إلى-نص.",
    profilePlaceholder:
      '{\n  "headers": {\n    "Authorization": "Bearer ..."\n  },\n  "cookies": {\n    "session": "..." \n  }\n}',
    recentRuns: "عمليات التشغيل الأخيرة",
    noRuns: "لم يتم تسجيل أي عمليات تشغيل نشطة مصرح بها بعد.",
    loadingReport: "جارٍ تحميل التقرير...",
    findingsCount: "{count} نتائج",
    highFindingsCount: "{count} عالية",
    empty: "أنشئ عملية تحقق أو افتح تشغيلًا سابقًا لعرض تقرير كامل للاختبار المصرح به.",
    executedAt: "نُفذ في",
    executiveSummary: "الملخص التنفيذي",
    modulesExecuted: "الوحدات المنفذة",
    recommendedActions: "الإجراءات الموصى بها",
    guardrails: "الضوابط",
    baseline: "الخط الأساسي السلبي",
    score: "درجة الأمان",
    pagesScanned: "الصفحات المفحوصة",
    aiAnalysis: "تحليل المعالجة بالذكاء الاصطناعي",
    aiUnavailable: "تحليل الذكاء الاصطناعي غير متاح",
    aiUnavailableDescription:
      "اكتمل التقرير الحتمي، لكن النموذج المضبوط لم يرجع ملخصًا آليًا لهذا التشغيل.",
    runNotes: "ملاحظات التشغيل",
    highFindings: "النتائج العالية",
    mediumFindings: "النتائج المتوسطة",
    lowFindings: "النتائج المنخفضة",
    authProfiles: "ملفات الصلاحيات",
    executionInsights: "مؤشرات التنفيذ",
    parallelism: "التوازي بين الوحدات",
    cacheHits: "إصابات ذاكرة التخزين",
    cacheMisses: "إخفاقات ذاكرة التخزين",
    rateLimits: "الاستجابات المحددة بالمعدل",
    backoffEvents: "عمليات التراجع التكيفية",
    networkRequests: "طلبات الشبكة",
    prioritizedModules: "الوحدات ذات الأولوية",
    priorityScore: "الدرجة {score}",
    plan: "خطة التنفيذ",
    safeMethod: "الطريقة الآمنة",
    attackPaths: "مسارات الهجوم المنمذجة",
    safeValidation: "التحقق الآمن",
    predictions: "المخاطر المتوقعة",
    noPredictions:
      "لم يتم توقع مخاطر إضافية تالية استنادًا إلى الخط الأساسي السلبي والنتائج الحالية للقراءة فقط.",
    findings: "النتائج المؤكدة",
    noFindings:
      "لم يتم تأكيد أي نتيجة داخل نافذة التغطية الحالية للقراءة فقط. هذا لا يغني عن مراجعة الكود أو الاختبار الأعمق بعد تسجيل الدخول.",
    noneRecorded: "لا يوجد ما سُجل في نافذة التشغيل هذه.",
    indicators: "المؤشرات",
    recommendedCheck: "الفحص الموصى به",
    confidence: "الثقة",
    validationRationale: "مبرر التحقق",
    remediation: "المعالجة",
    safeRetest: "إعادة الاختبار الآمنة",
    timeline: "الخط الزمني للتدقيق",
    methods: {
      dns_txt: "DNS TXT",
      http_file: "ملف HTTP",
      html_meta: "وسم HTML meta"
    },
    modules: {
      sql_injection: "حقن SQL",
      xss: "XSS",
      authentication: "المصادقة",
      authorization: "التفويض",
      api_security: "أمن الواجهة البرمجية",
      waf: "تطبيع WAF",
      session_management: "إدارة الجلسة"
    },
    statuses: {
      pending: "قيد الانتظار",
      verified: "تم التحقق",
      failed: "فشل",
      expired: "منتهي"
    },
    runStatuses: {
      planned: "مخطط",
      running: "قيد التشغيل",
      completed: "مكتمل",
      failed: "فشل"
    },
    planSources: {
      ai: "خطة بالذكاء الاصطناعي",
      deterministic: "خطة حتمية"
    },
    riskLevels: {
      low: "مخاطر منخفضة",
      medium: "مخاطر متوسطة",
      high: "مخاطر عالية",
      critical: "مخاطر حرجة"
    },
    severities: {
      info: "معلوماتي",
      low: "شدة منخفضة",
      medium: "شدة متوسطة",
      high: "شدة عالية"
    },
    validationStatuses: {
      confirmed: "مؤكد",
      needs_review: "يحتاج مراجعة",
      unlikely: "غير مرجح"
    },
    likelihoods: {
      low: "احتمال منخفض",
      medium: "احتمال متوسط",
      high: "احتمال مرتفع"
    },
    sources: {
      ai: "مدعوم بالذكاء الاصطناعي",
      heuristic: "استدلالي"
    },
    priorities: {
      immediate: "عالج الآن",
      next: "عالج لاحقًا",
      hardening: "تقوية"
    },
    pathStatuses: {
      blocked: "محجوب",
      constrained: "مقيد",
      exposed: "مكشوف"
    },
    eventTypes: {
      status: "الحالة",
      ownership: "الملكية",
      guardrail: "ضابط",
      plan: "خطة",
      discovery: "اكتشاف",
      request: "طلب",
      finding: "نتيجة",
      warning: "تحذير",
      summary: "ملخص"
    },
    requestsSent: "الطلبات"
  },
  metrics: {
    unavailable: "المقاييس غير متاحة",
    loadFailed: "فشل تحميل المقاييس.",
    conversations: "المحادثات",
    conversationsChange: "+{count} خلال آخر 7 أيام",
    indexedFiles: "الملفات المفهرسة",
    indexedFilesChange: "+{count} تمت فهرستها خلال آخر 24 ساعة",
    toolExecutions: "تنفيذات الأدوات",
    toolExecutionsChange: "نسبة النجاح {rate}%",
    localModelLatency: "زمن استجابة النموذج المحلي",
    providersAvailable: "{count} موفر متاح",
    modelEndpointUnreachable: "تعذر الوصول إلى نقطة نهاية النموذج"
  },
  policy: {
    loadFailed: "فشل تحميل السياسات.",
    refreshFailed: "فشل التحديث.",
    nameRequired: "اسم السياسة مطلوب.",
    saveFailed: "فشل حفظ السياسة.",
    deleteFailed: "فشل حذف السياسة.",
    modeFailed: "فشل تحديث وضع مساحة العمل.",
    testFailed: "فشل اختبار السياسة.",
    policies: "السياسات",
    scopedRuleSets: "مجموعات القواعد المقيّدة",
    editor: "المحرر",
    editPolicy: "تعديل السياسة",
    createPolicy: "إنشاء سياسة",
    refresh: "تحديث",
    save: "حفظ",
    delete: "حذف",
    new: "جديد",
    name: "الاسم",
    mode: "الوضع",
    description: "الوصف",
    metadataJson: "بيانات وصفية JSON",
    active: "نشط",
    inactive: "غير نشط",
    rules: "القواعد",
    ruleSet: "مجموعة قواعد السياسة",
    assignments: "التعيينات",
    inheritanceTargets: "أهداف الوراثة",
    addRule: "قاعدة",
    addAssignment: "تعيين",
    remove: "إزالة",
    workspaceMode: "وضع مساحة العمل",
    activePolicyPosture: "وضع السياسة النشط",
    customPolicy: "سياسة مخصصة",
    selectCustomPolicy: "اختر سياسة مخصصة",
    apply: "تطبيق",
    policyTest: "اختبار السياسة",
    dryRunAction: "محاكاة إجراء",
    action: "الإجراء",
    tool: "الأداة",
    model: "النموذج",
    provider: "الموفر",
    contentPlaceholder: "محتوى الطلب أو الملخّص أو وصف حمولة الأداة",
    evaluate: "تقييم",
    approvalRequired: "يتطلب موافقة",
    auditLogs: "سجلات التدقيق",
    latestPolicyDecisions: "أحدث قرارات السياسة",
    time: "الوقت",
    category: "الفئة",
    decision: "القرار",
    toolOrModel: "الأداة / النموذج",
    scope: "النطاق",
    created: "تم إنشاء السياسة.",
    updated: "تم تحديث السياسة.",
    deleted: "تم حذف السياسة.",
    testCompleted: "اكتمل اختبار السياسة.",
    workspaceModeSet: "تم ضبط وضع مساحة العمل على {mode}.",
    roleScopes: "نطاقات الأدوار",
    toolNames: "أسماء الأدوات",
    workspaceRoles: "أدوار مساحة العمل",
    modelPatterns: "أنماط النماذج",
    conditionsJson: "شروط JSON",
    priority: "الأولوية",
    enabled: "مفعل",
    assignmentType: "نوع التعيين",
    scopeId: "معرّف النطاق",
    notRequired: "غير مطلوب",
    requestMetadata: "بيانات الطلب JSON",
    url: "الرابط",
    fileName: "اسم الملف",
    fileSize: "حجم الملف (بالبايت)",
    mimeType: "نوع MIME",
    sql: "SQL",
    roleOverride: "تجاوز الدور",
    workspaceRoleOverride: "تجاوز دور مساحة العمل",
    system: "نظام",
    rulesCount: "{count} قواعد",
    assignmentsCount: "{count} تعيينات",
    noData: "غير متوفر"
  },
  enums: {
    policyCategories: {
      code_generation: "توليد الكود",
      security_research: "بحث أمني",
      vulnerability_analysis: "تحليل الثغرات",
      document_access: "الوصول إلى المستندات",
      external_url_access: "الوصول إلى روابط خارجية",
      agent_execution: "تنفيذ الوكلاء",
      tool_usage: "استخدام الأدوات",
      file_uploads: "رفع الملفات",
      database_queries: "استعلامات قاعدة البيانات",
      command_execution: "تنفيذ الأوامر"
    },
    policyDecisions: {
      allow: "سماح",
      warn: "تحذير",
      require_approval: "تتطلب موافقة",
      deny: "منع"
    },
    policyModes: {
      open: "مفتوح",
      strict: "صارم",
      enterprise: "مؤسسي",
      research: "بحثي",
      custom: "مخصص"
    },
    policyScopes: {
      workspace: "مساحة العمل",
      organization: "المؤسسة",
      user: "المستخدم",
      global: "عام"
    },
    policyAssignmentTypes: {
      overlay: "تراكب",
      mode: "وضع",
      baseline: "أساس"
    },
    roles: {
      super_admin: "مدير فائق",
      admin: "مدير",
      manager: "مدير فريق",
      developer: "مطور",
      viewer: "مشاهد"
    },
    workspaceRoles: {
      owner: "مالك",
      admin: "مدير",
      member: "عضو",
      viewer: "مشاهد"
    },
    memoryTypes: {
      preference: "تفضيل",
      long_term: "طويلة المدى",
      short_term: "قصيرة المدى"
    }
  }
} as const;

export default ar;
