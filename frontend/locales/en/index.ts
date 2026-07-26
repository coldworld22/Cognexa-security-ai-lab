const en = {
  brand: {
    aiWorkspace: "AI Workspace",
    tagline: "Private AI workspace for engineering teams"
  },
  language: {
    label: "Language",
    english: "English",
    arabic: "Arabic"
  },
  common: {
    workspace: "Workspace",
    profile: "Profile",
    admin: "Admin",
    account: "Account",
    runtime: "Runtime",
    chat: "Chat",
    endpoints: "Endpoints",
    documents: "Documents",
    agents: "Agents",
    memory: "Memory",
    tasks: "Tasks",
    security: "Security",
    save: "Save",
    delete: "Delete",
    refresh: "Refresh",
    apply: "Apply",
    accept: "Accept",
    send: "Send",
    signIn: "Sign In",
    new: "New",
    pending: "Pending",
    unavailable: "Unavailable",
    close: "Close",
    open: "Open",
    selected: "{count} selected",
    totalThreads: "{count} total threads",
    status: {
      ready: "Ready",
      responding: "Responding",
      online: "Online",
      degraded: "Degraded",
      offline: "Offline",
      completed: "Completed",
      running: "Running",
      failed: "Failed",
      skipped: "Skipped",
      started: "Started",
      queued: "Queued",
      pending: "Pending"
    }
  },
  login: {
    badge: "Private AI Infrastructure",
    headlineLine1: "Private AI Infrastructure",
    headlineLine2: "for Engineering Teams",
    description:
      "Deploy models, run agents, manage knowledge, and automate workflows entirely inside your own environment.",
    accessBadge: "Secure Workspace Access",
    welcomeBack: "Welcome back",
    accessDescription: "Sign in to access your Cognexa workspace.",
    accessHelper: "Use your workspace credentials to continue into your private AI environment.",
    protectedNotice:
      "Protected by workspace-level authentication and role-based access control.",
    trust: {
      privateDeployment: "Private deployment",
      bilingual: "English + Arabic",
      rbac: "Workspace RBAC"
    },
    features: {
      agents: {
        title: "AI Agents",
        description:
          "Run agent workflows with structured reasoning, tools, and controlled execution."
      },
      knowledge: {
        title: "Enterprise Knowledge",
        description:
          "Ground conversations and tasks with internal documents, retrieval, and memory."
      },
      models: {
        title: "Local Models",
        description:
          "Deploy private model infrastructure inside your own environment and policies."
      }
    }
  },
  authForm: {
    usernameLabel: "Username or email",
    usernamePlaceholder: "Enter your username or email",
    workspaceLabel: "Workspace",
    workspacePlaceholder: "Workspace name or slug",
    workspaceHelper: "Optional. Open a specific workspace immediately after sign-in.",
    recentWorkspaces: "Recent workspaces",
    workspaceFallbackNotice:
      "Workspace '{workspace}' was not found on this account. Opening your default workspace instead.",
    passwordLabel: "Password",
    passwordPlaceholder: "Enter password",
    rememberMe: "Remember me",
    rememberedHint: "Session will stay available on this device.",
    sessionOnlyHint: "Session will close when this browser session ends.",
    forgotPassword: "Forgot password",
    forgotPasswordSupport:
      "Password resets are managed by your workspace administrator for this deployment.",
    signingIn: "Signing In...",
    signIn: "Sign In",
    authFailed: "Authentication failed.",
    capsLockOn: "Caps Lock is on.",
    showPassword: "Show password",
    hidePassword: "Hide password"
  },
  loginHelp: {
    title: "Operator tips",
    enter: "Press Enter to submit",
    tab: "Use Tab to move between fields",
    language: "Use EN / ع to switch the interface"
  },
  home: {
    redirecting: "Redirecting",
    preparing: "Preparing",
    openingSecureSignIn: "Opening secure sign in",
    connecting: "Connecting Cognexa",
    redirectDescription:
      "No active operator session was found, so the app is sending you to the login screen.",
    preparingDescription:
      "Loading your workspace session and checking whether secure access is already available on this browser."
  },
  sidebar: {
    workspaceTitle: "Workspace",
    noWorkspaceSelected: "No workspace selected",
    noOrganizationContext: "No organization context",
    newChat: "New Chat",
    conversations: "Conversations",
    emptyConversations:
      "Start a new chat to turn this workspace into an engineering thread with memory, tools, and task history.",
    deleteConversation: "Delete {title}",
    updatedAt: "{provider} / {date}"
  },
  workspacePanel: {
    workspaceSettings: "Workspace Settings",
    workspaceDescription:
      "Switch workspaces, manage invitations, and handle member operations.",
    profileDescription:
      "Review account context and sign out without leaving the workspace.",
    closeWorkspaceSettings: "Close workspace settings",
    switchWorkspace: "Switch Workspace",
    newWorkspace: "New Workspace",
    inviteMember: "Invite Member",
    invitations: "Invitations",
    invitationsDescription: "Pending workspace access requests available to this account.",
    noPendingInvitations: "No pending invitations.",
    noOrganizationContext: "No organization context available.",
    admin: "Admin",
    logout: "Logout",
    workspaceUnavailable: "No workspace selected"
  },
  workspace: {
    bootstrapping: "Bootstrapping",
    connectingTitle: "Connecting Cognexa",
    connectingDescription:
      "Loading your session, model catalog, tools, memory, and conversations.",
    authRequired: "Authentication Required",
    signInBeforeUsing: "Sign in before using Cognexa",
    signInDescription:
      "Live conversation, memory, providers, and tools require an authenticated session.",
    goToLogin: "Go to Login",
    noToolsSelected: "Select at least one tool before launching an agent task.",
    noModelAvailable: "No installed local model is available for provider '{provider}'.",
    deleteConversationConfirm:
      'Delete "{title}"? This will remove its messages permanently.',
    conversationNotFound: "Conversation not found.",
    initializeFailed: "Failed to initialize the assistant workspace.",
    loadMessagesFailed: "Failed to load conversation messages.",
    refreshTaskFailed: "Failed to refresh running task.",
    loadTaskFailed: "Failed to load task detail.",
    refreshTasksFailed: "Failed to refresh agent tasks.",
    deleteConversationFailed: "Failed to delete conversation.",
    agentExecutionFailed: "Agent execution failed.",
    switchWorkspaceFailed: "Failed to switch workspace.",
    createWorkspaceFailed: "Failed to create workspace.",
    inviteMemberFailed: "Failed to invite member.",
    acceptInvitationFailed: "Failed to accept invitation.",
    sendMessageFailed: "Message send failed.",
    taskLoadFailed: "Failed to load agent tasks.",
    workspaceNamePrompt: "Workspace name",
    organizationNamePrompt: "Organization name (optional)",
    inviteEmailPrompt: "Invite member email",
    inviteRolePrompt: "Workspace role: owner, admin, member, or viewer",
    invitationCreated: "Invitation created for {email}.{tokenNotice}",
    taskTitleFallback: "Agent Task",
    conversationTitleFallback: "New Chat",
    mobileMenu: "Menu",
    mobileWorkspace: "Workspace",
    workspaceLabel: "Workspace"
  },
  chat: {
    startTaskTitle: "What do you want to work on?",
    startTaskDescription:
      "Ask about the codebase, uploaded files, memory context, or open the workspace tabs when you need agents, task traces, or security tools.",
    starterCards: {
      security: {
        eyebrow: "Security Review",
        title: "Audit authentication and session boundaries",
        body: "Trace login, refresh flow, workspace headers, and protected routes from frontend to backend."
      },
      documents: {
        eyebrow: "Documents",
        title: "Inspect retrieval and ingestion paths",
        body: "Map document parsing, vector storage, and retrieval behavior across the stack."
      },
      agents: {
        eyebrow: "Agent Ops",
        title: "Launch a workspace task",
        body: "Use the workspace tabs to run tools, inspect memory, and review persisted task traces."
      }
    },
    assistant: "Assistant",
    you: "You",
    thinking: "Thinking...",
    quickPrompts: "Quick prompts",
    sources: "Sources",
    matchScore: "{score} match",
    copyMessage: "Copy",
    modelUnassigned: "Model unassigned",
    personalWorkspace: "Personal workspace"
  },
  composer: {
    runtime: "Runtime",
    providerNotInstalled: "{provider} (not installed)",
    noInstalledModels: "No installed models",
    placeholder: "Message Cognexa about code, files, tools, or retrieval context",
    responding: "Responding...",
    send: "Send",
    enterToSend: "Enter to send. Shift + Enter for a new line.",
    autoExpand: "Auto-expands up to 200px.",
    noLocalModels: "No local models are installed for '{provider}'."
  },
  documents: {
    title: "Document Workspace",
    headline: "Retrieval and document analysis stay attached to the active workspace.",
    description:
      "Cognexa already scaffolds ingestion, embeddings, and persisted retrieval. Use chat for ad-hoc analysis, or use agent tasks when you need repeatable multi-step investigation.",
    pipeline: "Pipeline",
    pipelineDescription:
      "Uploads, parsing, chunking, embeddings, and vector storage are all represented in the current stack.",
    runtime: "Runtime",
    runtimeDescription: "Active model: {provider} / {model}",
    toolSurfaces: "Tool Surfaces",
    toolSurfacesDescription: "{count} document-oriented tools are available in this workspace.",
    inventory: "Tool Inventory",
    noTools: "No retrieval-oriented tools are currently exposed to the frontend."
  },
  endpoints: {
    title: "Endpoint Monitor",
    headline: "Track registered PCs on the same network from the active workspace.",
    description:
      "This surface keeps a live inventory of registered LAN endpoints, shows their latest reachability state, and highlights assets that need operator attention.",
    visibilityTitle: "What this can see",
    visibilityDescription:
      "Discovery and refresh can find LAN PCs and track reachability. Detailed activity monitoring still requires an endpoint agent, Sysmon, or another host telemetry source on each PC.",
    total: "Registered PCs",
    onlineNow: "Online now",
    needsAttention: "Needs attention",
    activeAlerts: "Active alerts",
    inventory: "LAN Inventory",
    sameNetworkOnly: "Refresh probes only the IP addresses already registered in this workspace.",
    discoverInventory: "Discover LAN PCs",
    discovering: "Discovering PCs",
    refreshInventory: "Refresh Status",
    searchPlaceholder: "Search by name, IP, OS, subnet, user, or tag",
    allStatuses: "All statuses",
    noEndpoints: "No PCs have been registered for monitoring in this workspace yet.",
    emptySearch: "No monitored PCs match the current filters.",
    addEndpoint: "Register PC",
    formDescription:
      "Add a workstation or server you want this workspace to monitor. The backend refresh will probe only these saved IP addresses.",
    name: "Display name",
    hostname: "Hostname",
    ipAddress: "IPv4 address",
    subnet: "Subnet",
    operatingSystem: "Operating system",
    loggedInUser: "Logged-in user",
    tags: "Tags (comma separated)",
    tagsHint: "Examples: finance, kiosk, dc-west, tier-1",
    saveEndpoint: "Save Endpoint",
    endpointDetails: "Endpoint Detail",
    noSelection: "Select a monitored PC to inspect its latest status and telemetry.",
    lastSeen: "Last seen",
    latency: "Latency",
    cpu: "CPU",
    memory: "Memory",
    disk: "Disk",
    loadFailed: "Failed to load monitored PCs.",
    discoverFailed: "Failed to discover PCs on the local network.",
    refreshFailed: "Failed to refresh monitored PCs.",
    createFailed: "Failed to register the monitored PC.",
    riskLevels: {
      low: "Low risk",
      medium: "Medium risk",
      high: "High risk",
      critical: "Critical risk"
    }
  },
  agents: {
    console: "Agent Console",
    headline: "Launch tool-assisted tasks against the current workspace.",
    description:
      "This is the execution surface for repeatable investigations, engineering checks, and workspace-wide analysis.",
    placeholder:
      "Summarize the RAG pipeline, inspect repository auth flow, or review task traces.",
    enabledTools: "Enabled tools",
    runTask: "Run Task",
    runningTask: "Running Task",
    refreshTasks: "Refresh Tasks",
    recentRuns: "Recent Runs",
    noRuns: "No persisted agent runs yet.",
    persistedRuns: "{count} persisted runs available.",
    populateHistory: "Run an objective to populate workspace task history.",
    activeTrace: "Active Trace",
    selectTask: "Select a task to inspect detail in the Tasks tab.",
    openTrace:
      "Open the full task trace to inspect steps, reasoning, and tool executions.",
    toolAssistedTask: "Tool-assisted workspace task"
  },
  memory: {
    preferences: "Preferences",
    preferencesDescription: "Stable operator preferences and workspace-specific behavior.",
    longTerm: "Long-Term Memory",
    longTermDescription: "Persisted knowledge carried across conversations.",
    shortTerm: "Short-Term Context",
    shortTermDescription: "Recent conversation context feeding the current workspace.",
    noEntries: "No {section} entries yet."
  },
  tasks: {
    title: "Task Timeline",
    headline: "Inspect persisted task traces, reasoning, and tool execution state.",
    description:
      "Each agent run records step-by-step execution data so teams can review outcomes without reopening the original conversation.",
    noTasks: "No task history is available for this workspace yet.",
    detailTitle: "Task Detail",
    selectTask: "Select a task from the list to inspect its trace.",
    overview: "Overview",
    summaryFallback: "No final summary was stored for this task.",
    steps: "Steps",
    reasoningLog: "Reasoning Log",
    noReasoning: "No reasoning log recorded for this run.",
    toolExecutions: "Tool Executions",
    noToolExecutions: "No persisted tool executions were attached to this task.",
    tool: "Tool",
    input: "Input",
    output: "Output",
    fromTo: "{from} to {to}"
  },
  security: {
    governance: "Workspace Governance",
    headline: "Keep access, runtime, and task operations scoped to the active workspace.",
    description:
      "Workspace management now lives in a dedicated settings panel so chat and task surfaces stay uncluttered.",
    role: "Role",
    invitations: "Invitations",
    invitationsPending: "{count} pending",
    status: "Status",
    currentWorkspace: "Current Workspace",
    activeConversation: "Active conversation: {title} / {count} total threads",
    runtimeAccess: "Runtime and Access",
    currentModel: "Current Model",
    openWorkspaceSettings: "Open Workspace Settings",
    openProfilePanel: "Open Profile Panel",
    openAdminConsole: "Open Admin Console",
    accountContext: "Account Context"
  },
  admin: {
    dashboard: "Admin Dashboard",
    headline: "AI policy governance and runtime oversight",
    description:
      "Manage scoped AI policies, switch workspace modes, test rule outcomes, and audit every policy decision without weakening the existing auth or RBAC layers.",
    toolsLabel: "Tool Screens",
    toolsTitle: "Open standalone admin tools",
    toolsDescription:
      "Use dedicated screens for focused admin workflows instead of stacking every control into the main dashboard.",
    openTool: "Open tool"
  },
  privateMode: {
    navLabel: "Private Mode",
    launchDescription:
      "Open the cloaking console on its own screen to manage Tor routing, relay chains, leak tests, and exit logs.",
    screenTitle: "Private mode cloaking console",
    screenDescription:
      "This console keeps outbound cloaking controls separate from policy editing, passive scans, and authorized active testing.",
    label: "Private Mode",
    title: "Cloak outbound testing traffic behind controlled anonymity layers",
    description:
      "Configure the governed outbound route used by website scanning and authorized testing. Tor-backed routing is implemented in-process, while VPN-chain profiles still depend on external tunnel plumbing outside the app.",
    capabilityTitle: "Capability boundary",
    capabilityDescription:
      "Private Mode verifies and records the route it uses, but it does not implement in-process VPN orchestration or TLS handshake spoofing.",
    loading: "Loading private mode state...",
    loadFailed: "Failed to load private mode state.",
    refresh: "Refresh",
    save: "Save config",
    saving: "Saving...",
    saveFailed: "Failed to save private mode configuration.",
    configSaved: "Private mode configuration saved.",
    activate: "Activate",
    activating: "Activating...",
    activated: "Private mode activated.",
    activateFailed: "Failed to activate private mode.",
    deactivate: "Deactivate",
    deactivating: "Deactivating...",
    deactivated: "Private mode deactivated.",
    deactivateFailed: "Failed to deactivate private mode.",
    rotate: "Rotate circuit",
    rotating: "Rotating...",
    rotated: "Circuit rotated.",
    rotateFailed: "Failed to rotate the active circuit.",
    verify: "Verify cloak",
    verifying: "Verifying...",
    verified: "Cloaking verification completed.",
    verifyFailed: "Failed to verify cloaking.",
    leakTest: "Run leak test",
    testing: "Testing...",
    leakFailed: "Failed to run the leak test.",
    leakTestCompleted: "Leak test completed.",
    statusTitle: "Runtime status",
    active: "Active",
    inactive: "Inactive",
    mode: "Mode",
    cloaked: "Cloaked",
    leaking: "Leak detected",
    strategy: "Routing strategy",
    strategies: {
      tor: "Tor only",
      "vpn-chain": "VPN chain (external)",
      hybrid: "Hybrid (Tor for sensitive categories)",
      "rotating-proxy": "Tor circuit rotation"
    },
    dnsTor: "DNS over Tor",
    dnsLocal: "Local DNS",
    dnsOverTor: "Resolve DNS through the cloaked transport when possible",
    tlsFingerprint: "Request identity profile",
    fingerprintProfiles: {
      browser: "Browser-like headers",
      curl: "curl headers",
      random: "Rotating User-Agent headers"
    },
    torBackedStrategies: "Tor-backed strategies",
    externalTunnelStrategies: "External tunnel required",
    headerProfileNotice:
      "These profiles only adjust HTTP request headers such as User-Agent.",
    tlsSpoofingUnavailable:
      "The app does not spoof the TLS handshake or JA3 fingerprint.",
    torSocksPort: "Tor SOCKS port",
    torControlPort: "Tor control port",
    rotationInterval: "Circuit rotation interval (sec)",
    requestJitter: "Request timing jitter (ms)",
    exitGeography: "Preferred exit geographies",
    exitGeographyPlaceholder: "us, nl, se",
    enabledCategories: "Cloaked policy categories",
    relayJson: "Relay chain JSON",
    sessionTitle: "Session",
    verificationTitle: "Verification",
    noVerification: "Run cloak verification to inspect the current exit path.",
    leakTestTitle: "Leak test",
    noLeakTest: "Run a leak test to compare the direct path against the cloaked path.",
    configTitle: "Configuration",
    configHeading: "Workspace cloaking profile",
    exitNodes: "Exit nodes",
    circuits: "Circuits",
    startedAt: "Started at",
    lastRotatedAt: "Last rotated",
    exitIp: "Exit IP",
    directIp: "Direct IP",
    exitRegion: "Exit region",
    dnsTransport: "DNS transport",
    leaks: "Leaks",
    noLeaks: "No leaks reported",
    testedAt: "Tested at",
    none: "None",
    unknown: "Unknown",
    exitLogTitle: "Exit logs",
    exitLogHeading: "Observed outbound egress",
    noExitLogs: "No cloaked outbound requests have been recorded yet.",
    sessionId: "Session ID",
    requiredForSecurityModules:
      "Private Mode must be active before using website scanning or security testing modules.",
    verifiedRequiredForSecurityModules:
      "Private Mode must be active, its exit path verified, and the deployment must be running on HTTPS before using website scanning or security testing modules.",
    activateBeforeSecurityTools:
      "Activate Private Mode first, then return to this tool.",
    verifyBeforeSecurityTools:
      "Review the exit path and HTTPS transport in Private Mode, then return to this tool.",
    openConsole: "Open Private Mode",
    requiredPage: {
      label: "Private Mode Required",
      activateTitle: "Activate Private Mode before using this workspace",
      waitTitle: "This workspace is locked until Private Mode is activated",
      activateDescription:
        "This workspace now requires Private Mode to be active before chat, tools, agents, documents, or admin screens can be used.",
      waitDescription:
        "An administrator must activate Private Mode for this workspace before anything else becomes available.",
      openConsole: "Open Private Mode",
      checkAgain: "Check again"
    },
    activationTimelineTitle: "Connection stage",
    connectionProgress: "Stage {current} of {total}",
    connectionStates: {
      idle: "Idle",
      running: "Connecting",
      pending: "Verification pending",
      connected: "Connected",
      warning: "Needs review",
      failed: "Failed"
    },
    connectionHeadlines: {
      idle: "Private Mode is standing by",
      running: "Private Mode is establishing the cloaked route",
      pending: "Private Mode is active and waiting for exit verification",
      connected: "Private Mode is active",
      warning: "Private Mode is active with route warnings",
      failed: "Private Mode could not finish activation"
    },
    connectionDescriptions: {
      idle:
        "Start Private Mode to save the cloaking profile, establish the route, verify the exit path, and unlock security tools behind the cloaked transport.",
      running:
        "Cognexa is saving the routing profile, starting the cloaked session, synchronizing runtime state, and checking the exit path before it marks the workspace ready.",
      pending:
        "The cloaked session is running, but the exit path has not been confirmed yet. Run verification before starting sensitive security work.",
      connected:
        "The cloaked session is established and the latest verification confirmed an isolated exit path. Website scanning and authorized security workflows can proceed.",
      warning:
        "The cloaked session is up, but the latest verification reported leaks, an unconfirmed exit route, or an insecure HTTP deployment transport. Review the verification result before using security modules.",
      failed:
        "Activation stopped before the cloaked route was ready. Review the failed stage, adjust the profile if needed, and retry the connection."
    },
    stageStates: {
      current: "In progress",
      complete: "Complete",
      review: "Needs review",
      upcoming: "Waiting",
      failed: "Failed"
    },
    activationStages: {
      profile: {
        title: "Save workspace profile",
        description:
          "Persist the current Tor, relay, DNS, and jitter settings that define the cloaked route."
      },
      session: {
        title: "Start cloaked session",
        description:
          "Create a new private session and move outbound security traffic onto the selected strategy."
      },
      sync: {
        title: "Sync runtime state",
        description:
          "Refresh circuit metadata, exit log state, and the current workspace session after the route comes up."
      },
      verify: {
        title: "Verify exit path",
        description:
          "Check the observed exit IP, leak indicators, and deployment HTTPS transport before treating the route as ready for security operations."
      },
      active: {
        title: "Unlock security tools",
        description:
          "Mark the workspace as ready so website scanning and authorized testing run from the active private route."
      }
    },
    securityModules: "Security modules",
    securityStates: {
      locked: "Locked",
      pending: "Waiting for verification",
      ready: "Unlocked",
      review: "Review route warnings"
    },
    readyNotice: "Private Mode is active and the exit path was verified.",
    pendingNotice:
      "Private Mode is active. Exit verification could not be completed yet, so review the route before sensitive testing.",
    warningNotice:
      "Private Mode is active, but verification reported warnings on the current exit route.",
    verificationWarnings:
      "Verification completed with warnings. Review the exit path before continuing.",
    httpTransportWarning:
      "Private Mode verified the exit path, but this deployment is still running over HTTP. Enable HTTPS before treating the route as ready for security operations.",
    snapshotTitle: "Connection snapshot",
    snapshotHeading: "Direct identity versus cloaked identity",
    snapshotDescription:
      "Use this panel to compare the backend host's current public identity against the observed cloaked exit identity and decide whether the route is ready for sensitive work.",
    directPath: "Direct path",
    exitPath: "Observed exit path",
    assuranceTitle: "Operator assurance",
    location: "Location",
    organization: "Organization",
    asn: "ASN",
    network: "Network",
    torStatus: "Tor status",
    verificationPath: "Verification path",
    timezone: "Timezone",
    advisories: "Routing notes",
    noAdvisories: "No additional routing notes for the current profile.",
    assuranceStates: {
      verified: "Route verified",
      review: "Operator review",
      pending: "Verification pending",
      idle: "No active route"
    },
    torStates: {
      confirmed: "Confirmed Tor exit",
      notDetected: "Not detected as a Tor exit",
      unknown: "Tor status unavailable"
    },
    networkStates: {
      ipv4: "IPv4",
      ipv6: "IPv6",
      unknown: "Unknown"
    },
    leakCodes: {
      private_mode_inactive: "Private Mode is not active for this workspace.",
      system_proxy_inactive:
        "Windows system proxy enforcement is not fully active, so browser and app traffic may bypass the cloaked route.",
      webrtc_protection_incomplete:
        "WebRTC leak protections are incomplete, so browsers may still expose network identity through peer-connection paths.",
      ip_leak_rules_inactive:
        "The firewall leak-prevention rules are not active, so direct DNS, STUN, QUIC, or browser bypass traffic may escape.",
      exit_ip_unavailable: "The service could not observe an exit IP for the current route.",
      tor_exit_unconfirmed: "The verification path should be Tor-backed, but the observed exit was not confirmed as a Tor exit.",
      exit_ip_matches_direct_path:
        "The observed cloaked path matched the direct public IP, so the route does not appear isolated.",
      dns_over_tor_requested_without_tor_transport:
        "DNS over Tor is enabled, but the current verification path is not using a Tor-backed transport."
    },
    advisoryCodes: {
      vpn_chain_external_tunnel_required:
        "VPN chain mode relies on an external host or network tunnel. This console can show the current public identity, but it cannot prove relay order inside the app.",
      hybrid_sensitive_categories_only:
        "Hybrid mode only routes sensitive categories such as security research and vulnerability analysis through Tor-backed transport.",
      hybrid_sensitive_categories_disabled:
        "Hybrid mode fell back to an external URL path for verification because the sensitive cloaked categories are not enabled in this profile.",
      rotating_proxy_uses_tor_transport:
        "Rotating proxy currently uses the Tor-backed transport inside the app rather than a separate managed proxy pool.",
      browser_proxy_review_required:
        "Protected browser shortcuts or browser policy bindings are incomplete. Review the desktop launchers before sensitive browsing.",
      app_proxy_enforcement_incomplete:
        "App-level enforcement could not confirm both the system proxy bridge and the browser kill-switch rules together.",
      system_dns_not_forced:
        "DNS-over-Tor was requested, but the local Tor DNS listener was unavailable or Windows adapter DNS could not be pinned to localhost.",
      fingerprint_hardening_incomplete:
        "Fingerprint hardening is incomplete, so protected browser profiles still need review before high-sensitivity browsing."
    }
  },
  adminNetwork: {
    label: "Network Monitor",
    title: "Scan and watch LAN PCs from the admin console",
    description:
      "This console scans the backend host's local network, caches host identity, and keeps a live observed list so you can spot devices that appear, disappear, or change names.",
    navLabel: "Network Monitor",
    launchDescription:
      "Open the LAN discovery tool on its own screen so live network scans stay separate from the dashboard.",
    screenTitle: "Network monitor tool",
    screenDescription:
      "This network monitor runs on its own admin screen so discovery jobs and host inventory do not overload the main dashboard.",
    liveRefresh: "Live refresh",
    scanNow: "Scan now",
    resolveNames: "Resolve names",
    observedHosts: "Observed hosts",
    onlineHosts: "Online hosts",
    offlineHosts: "Offline hosts",
    subnetsScanned: "Subnets scanned",
    visibilityTitle: "What this can see",
    visibilityDescription:
      "This surface can discover PCs on the same LAN and monitor basic reachability. It cannot inspect detailed user activity unless those PCs also send host telemetry from an installed agent, Sysmon, WEF, or another endpoint source.",
    runtimeNoteTitle: "Runtime note",
    runtimeNote:
      "The scan runs from the backend server. If the backend is running inside Docker or another isolated network, results may reflect that runtime network instead of your full Wi-Fi LAN.",
    searchPlaceholder: "Search by hostname, IP, vendor, subnet, MAC, or interface",
    computersOnly: "Computers only",
    computersAndCandidates: "Computers + unclassified candidates",
    verifiedComputersOnly: "Classified computers only",
    allDeviceTypes: "All device types",
    computersDetected: "Computers detected",
    laptops: "Laptops",
    desktops: "Desktops",
    unknownComputerType: "Type not verified",
    unclassifiedCandidates: "Unclassified candidates",
    statusChecked: "Status checked: {value}",
    connectivityStates: {
      online: "Online",
      offline: "Offline",
      unverified: "Status unverified"
    },
    noComputersClassified:
      "Devices were discovered, but none has enough evidence to be classified as a computer. Run Resolve names and verify that SMB, RDP, or WinRM is reachable from this server.",
    deviceClassification: "Device classification",
    insufficientEvidence: "Insufficient network evidence",
    agentNeededForChassis:
      "Install the endpoint heartbeat on this PC to verify laptop versus desktop from Windows chassis data.",
    confidence: {
      high: "High confidence",
      medium: "Medium confidence",
      low: "Low confidence"
    },
    deviceCategories: {
      computer: "Computer",
      phone: "Phone",
      tablet: "Tablet",
      printer: "Printer",
      camera: "Camera",
      network: "Network equipment",
      iot: "IoT device",
      unknown: "Unknown device"
    },
    formFactors: {
      desktop: "Desktop",
      laptop: "Laptop",
      workstation: "Workstation",
      server: "Server",
      unknown: "Laptop/desktop not verified"
    },
    allStatuses: "All statuses",
    allSources: "All sources",
    lastScanned: "Last scanned: {value}",
    scannedSubnets: "Scanned subnets",
    interfaces: "Server interfaces",
    noHosts: "No reachable PCs were found on the server's current local network.",
    emptySearch: "No observed PCs match the current search.",
    scanFailed: "Failed to scan the local network.",
    liveUpdatesFailed: "Live discovery updates were interrupted.",
    scanJobTitle: "Background discovery job",
    resolveJobTitle: "Background hostname resolution job",
    hostsFound: "hosts found",
    ipAddress: "IP address",
    hostname: "Computer name",
    macAddress: "MAC address",
    vendor: "Vendor",
    loggedInUser: "Logged-in user",
    interfaceAddress: "Interface address",
    source: "Name source",
    latency: "Latency",
    visibility: "Visibility",
    firstSeen: "First seen",
    lastSeen: "Last seen",
    remoteExternal: "Opens in a new tab",
    remoteEmbedded: "Embedded console",
    openInNewTab: "Open in new tab",
    remoteNotConfigured:
      "Remote control is not configured for this managed endpoint yet.",
    remotePlaceholder:
      "Remote control URL is still a placeholder. Configure a real Guacamole, MeshCentral, or other HTTPS remote console URL for this endpoint.",
    osUnknown: "Operating system unavailable",
    resolutionSources: {
      dns: "DNS",
      netbios: "NetBIOS",
      smb: "SMB",
      mdns: "mDNS",
      fortigate: "FortiGate",
      agent: "Agent",
      unresolved: "Unresolved"
    },
    activityLevels: {
      basic_reachability: "Basic reachability only",
      host_telemetry: "Host telemetry available"
    }
  },
  websiteScanner: {
    label: "Website Scanner",
    title: "Run a passive web security audit",
    description:
      "Scan a public website from the admin console, review transport and browser-hardening gaps, and detect public API, database, and internal service exposure without running exploit-style checks.",
    navLabel: "Website Scanner",
    openTool: "Open tool screen",
    launchDescription:
      "Open the passive website scanner on a dedicated screen for isolated web audit workflows.",
    screenTitle: "Website scanner tool",
    screenDescription:
      "This scanner runs on its own admin screen so website auditing stays separate from policy management and LAN monitoring.",
    policyTitle: "Policy gate",
    policyDescription:
      "This module is evaluated as external URL access plus vulnerability analysis. In stricter modes it may require switching the workspace policy posture to open, research, or a permissive custom policy before scans are allowed.",
    urlLabel: "Target URL",
    urlPlaceholder: "https://example.com",
    maxPages: "Max pages",
    scan: "Scan website",
    scanning: "Scanning...",
    passiveTitle: "Passive-only analysis",
    passiveDescription:
      "The scanner fetches the target site, follows same-origin links, and evaluates headers, cookies, forms, content patterns, and bounded same-origin API or service exposure probes. It does not attempt login, payload injection, or exploitation.",
    publicOnlyTitle: "Public targets only",
    publicOnlyDescription:
      "Only public HTTP and HTTPS URLs are allowed. Localhost, private IP ranges, and private-network redirects are blocked to reduce SSRF risk.",
    urlRequired: "Enter a public website URL before starting the scan.",
    scanFailed: "Website scan failed.",
    empty: "Run a scan to generate a website security report.",
    lastScanned: "Last scanned: {value}",
    finalUrl: "Final URL",
    analysisMode: "Analysis mode",
    browserEngine: "Browser engine",
    score: "Security score",
    pagesScanned: "Pages scanned",
    highFindings: "High findings",
    mediumFindings: "Medium findings",
    lowFindings: "Low findings",
    infoFindings: "Info findings",
    executiveSummary: "Executive summary",
    strengths: "Confirmed strengths",
    topRisks: "Top risks",
    priorityActions: "Priority actions",
    noneRecorded: "None recorded in this scan window.",
    crawlCoverage: "Crawl coverage",
    failedPages: "Failed pages",
    externalLinks: "External links discovered",
    scanNotes: "Scan notes",
    transport: "Transport",
    sameOrigin: "Same-origin pages discovered",
    redirectedHttps: "HTTP redirects to HTTPS",
    hsts: "HSTS enabled",
    tlsCertificate: "TLS certificate trust",
    cookies: "Cookies",
    cookieTotal: "Cookies observed",
    missingSecure: "Missing Secure",
    missingHttpOnly: "Missing HttpOnly",
    missingSameSite: "Missing SameSite",
    headers: "Headers",
    findings: "Findings",
    findingsTitle: "Detected exposure and hardening gaps",
    noFindings:
      "No findings were detected in this passive scan window. That does not replace authenticated testing or code review.",
    pages: "Pages",
    pagesTitle: "Scanned page inventory",
    page: "Page",
    remediation: "Remediation",
    surface: "Observed surface",
    exposure: "API & service exposure",
    forms: "Forms",
    loginForms: "Login forms",
    externalForms: "External actions",
    insecureForms: "Insecure password forms",
    inlineScripts: "Inline scripts",
    externalScripts: "Script tags with src",
    thirdPartyScripts: "Third-party scripts",
    mixedContent: "Mixed content",
    probedEndpoints: "Candidate endpoints probed",
    apiDocs: "Public API docs",
    apiEndpoints: "Sensitive API responses",
    databaseInterfaces: "Database interfaces",
    internalServices: "Internal services",
    sensitiveFiles: "Sensitive files",
    resources: "Public resources",
    fingerprints: "Observed stack hints",
    links: "Links",
    riskLevels: {
      low: "Low risk",
      medium: "Medium risk",
      high: "High risk",
      critical: "Critical risk"
    },
    analysisModes: {
      http: "HTTP crawl",
      browser: "Rendered browser crawl"
    },
    categories: {
      transport: "Transport",
      headers: "Headers",
      cookies: "Cookies",
      forms: "Forms",
      content: "Content",
      cors: "CORS",
      exposure: "Exposure"
    }
  },
  mobileScanner: {
    label: "Mobile Testing",
    navLabel: "Mobile Testing",
    launchDescription:
      "Open the mobile application security lab on its own screen for APK, AAB, and IPA analysis with persisted history and exportable reports.",
    screenTitle: "Mobile application security testing",
    screenDescription:
      "Upload APK, AAB, or IPA packages, route analysis through verified Private Mode, and review saved MobSF-backed findings, permissions, trackers, and recommendations.",
    title: "Run mobile app security scans",
    description:
      "This lab performs static mobile application analysis through the backend MobSF integration and stores each completed report in the current workspace.",
    policyTitle: "Execution model",
    policyDescription:
      "The backend performs a synchronous MobSF scan and saves the completed result when the request finishes. The frontend shows estimated progress while analysis is running and then reloads the saved history.",
    boundaryTitle: "Supported packages",
    boundaryDescription:
      "APK, AAB, and IPA files up to 100 MB are supported. The current workflow performs static analysis only and does not launch the application.",
    uploadLabel: "Application package",
    uploadHint: "Drag a package here or browse for an APK, AAB, or IPA file.",
    uploadActive: "Drop the mobile package to start validation.",
    uploadEmpty: "No mobile package selected yet.",
    chooseAnother: "Choose another file",
    fileReady: "Ready to scan",
    fileTypeInvalid: "Only APK, AAB, and IPA files are supported.",
    fileTooLarge: "The selected file exceeds the 100 MB upload limit.",
    fileRequired: "Select a mobile package before starting the scan.",
    scan: "Start mobile scan",
    scanning: "Scanning...",
    scanFailed: "Mobile scan failed.",
    scanCompleted: "Mobile scan completed.",
    scanDate: "Scan date",
    packageName: "Package name",
    version: "Version",
    targetSdk: "Target SDK",
    minSdk: "Minimum SDK",
    fileSize: "File size",
    riskLevel: "Risk level",
    findings: "Findings",
    totalFindings: "Total findings",
    riskyPermissions: "Risky permissions",
    detectedTrackers: "Detected trackers",
    historyTitle: "Recent mobile scans",
    historyDescription:
      "Completed mobile scan reports saved for the current workspace.",
    historyEmpty: "No mobile scan history is available yet.",
    historyLoading: "Loading mobile scan history...",
    historyLoadFailed: "Failed to load mobile scan history.",
    resultEmpty:
      "Select a previous scan or upload a package to inspect the stored report.",
    viewDetails: "View details",
    deleteConfirm: "Delete the stored mobile scan for {appName}?",
    deleteFailed: "Failed to delete the mobile scan.",
    deleted: "Mobile scan deleted.",
    exportPdf: "Export PDF",
    exportJson: "Export JSON",
    exportFailed: "Failed to export the mobile scan report.",
    exporting: "Exporting...",
    progressUploading: "Uploading package",
    progressAnalyzing: "Running MobSF analysis",
    progressReporting: "Parsing findings and saving the report",
    progressFinalizing: "Finalizing report",
    summary: "Summary",
    appInfo: "Application details",
    score: "Security score",
    scoreGood: "Lower observed risk",
    scoreNeedsWork: "Needs hardening",
    scoreCritical: "Immediate review required",
    permissions: "Permissions",
    vulnerabilities: "Vulnerabilities",
    trackers: "Trackers",
    trackersNone: "No trackers detected in this package.",
    recommendations: "Recommendations",
    recommendationsEmpty:
      "No additional recommendations were generated automatically for this scan.",
    remediation: "Remediation",
    noVulnerabilities:
      "No vulnerability entries were reported in this mobile scan result.",
    noPermissions: "No permissions were reported in this mobile scan result.",
    helpUploadTitle: "Package support",
    helpUploadDescription:
      "Upload APK, AAB, or IPA archives for MobSF-backed static analysis.",
    helpScoreTitle: "Scoring",
    helpScoreDescription:
      "Scores above 70 indicate lower observed risk. Scores below 50 should be reviewed immediately.",
    helpRouteTitle: "Private routing",
    helpRouteDescription:
      "Security modules stay gated behind verified Private Mode before a mobile scan can start.",
    permissionsRisk: {
      low: "Low risk",
      medium: "Medium risk",
      high: "High risk"
    },
    severities: {
      critical: "Critical",
      high: "High",
      medium: "Medium",
      low: "Low",
      info: "Info"
    }
  },
  securityReview: {
    label: "Security Review Lab",
    title: "Run an attacker-minded website review",
    description:
      "Enter a public website and let the lab review it from an attacker perspective using passive browser-safe checks. It highlights what an external attacker would notice first, including exposed APIs or service surfaces, and pairs each issue with a concrete hardening example.",
    navLabel: "Security Review Lab",
    launchDescription:
      "Open the attacker-perspective website review on its own screen so deeper public-surface analysis stays separate from the passive scanner summary.",
    screenTitle: "Security review lab",
    screenDescription:
      "This review lab runs on its own admin screen so attacker-perspective website analysis stays separate from passive web scanning and policy editing.",
    boundaryTitle: "Safety boundary",
    boundaryDescription:
      "This module only reviews public HTTP and HTTPS websites. It blocks localhost and private-network targets, avoids login or payload injection, and stays in a passive same-origin crawl window.",
    urlLabel: "Target website",
    urlPlaceholder: "https://example.com",
    maxPages: "Max pages",
    run: "Run review",
    running: "Running...",
    attackerTitle: "Attacker perspective",
    attackerDescription:
      "The lab thinks like an external attacker: it looks for weak browser trust boundaries, credential exposure paths, exposed APIs or management surfaces, recon clues, and cross-origin mistakes that make a public site easier to abuse.",
    publicOnlyTitle: "Public targets only",
    publicOnlyDescription:
      "Only public HTTP and HTTPS URLs are allowed. Localhost, private IP ranges, and private-network redirects stay blocked to reduce SSRF and internal probing risk.",
    empty: "Run the review to generate an attacker-perspective report for a public website.",
    lastReviewed: "Last reviewed: {value}",
    requestedUrl: "Requested URL",
    finalUrl: "Final URL",
    hostname: "Hostname",
    pagesScanned: "Pages scanned",
    analysisMode: "Analysis mode",
    browserEngine: "Browser engine",
    score: "Security score",
    highFindings: "High findings",
    mediumFindings: "Medium findings",
    lowFindings: "Low findings",
    failChecks: "Failed checks",
    targetScope: "Target scope",
    reviewNotes: "Review notes",
    executiveSummary: "Executive summary",
    confirmedControls: "Confirmed controls",
    topRisks: "Top risks",
    recommendedActions: "Recommended actions",
    roadmap: "Remediation roadmap",
    roadmapImmediate: "Fix now",
    roadmapNext: "Fix next",
    roadmapHardening: "Hardening backlog",
    aiAnalyst: "AI security analyst",
    analystPerspective: "Analyst perspective",
    decisiveVerdict: "Decisive verdict",
    aiDecisions: "Decision plan",
    retestFocus: "Retest focus",
    aiConstraints: "Guardrails",
    aiUnavailable: "AI analyst unavailable",
    aiUnavailableDescription:
      "The deterministic security review still completed, but inline AI commentary was unavailable for this run.",
    attackPaths: "Modeled attack paths",
    findings: "Findings",
    checks: "Checks",
    noFindings:
      "No material finding was generated in this review window. That does not replace authenticated testing or code review.",
    noneRecorded: "None recorded in this review window.",
    runFailed: "Security review failed.",
    urlRequired: "Enter a public website URL before starting the review.",
    attackerExample: "Attacker example",
    attackerGoal: "Attacker goal",
    attackerView: "Why an attacker cares",
    attackerPrerequisites: "Attacker prerequisites",
    attackerEffort: "Attacker effort",
    impact: "Potential impact",
    confidence: "Confidence",
    priority: "Priority",
    fixExample: "Fix example",
    safeVerification: "Safe verification",
    supportingSignals: "Supporting signals",
    page: "Page",
    remediation: "Remediation",
    passCount: "{count} passed",
    warnCount: "{count} warned",
    failCount: "{count} failed",
    riskLevels: {
      low: "Low risk",
      medium: "Medium risk",
      high: "High risk",
      critical: "Critical risk"
    },
    analysisModes: {
      http: "HTTP crawl",
      browser: "Rendered browser crawl"
    },
    severities: {
      low: "Low severity",
      medium: "Medium severity",
      high: "High severity"
    },
    efforts: {
      low: "Low effort",
      medium: "Medium effort",
      high: "High effort"
    },
    confidences: {
      low: "Low confidence",
      medium: "Medium confidence",
      high: "High confidence"
    },
    priorities: {
      immediate: "Fix now",
      next: "Fix next",
      hardening: "Hardening"
    },
    statuses: {
      pass: "Pass",
      warn: "Warn",
      fail: "Fail",
      info: "Info"
    },
    categories: {
      transport: "Transport",
      headers: "Headers",
      cookies: "Cookies",
      forms: "Forms",
      content: "Content",
      cors: "CORS",
      exposure: "Exposure"
    }
  },
  authorizedTesting: {
    label: "Authorized Testing",
    title: "Run verified, read-only active security tests",
    description:
      "Create a domain-ownership challenge, verify the public hostname, and run guarded active checks that stay reversible and auditable.",
    navLabel: "Authorized Testing",
    launchDescription:
      "Open the authorized active testing lab on its own screen for ownership verification, safe probes, and audit review.",
    screenTitle: "Authorized security testing lab",
    screenDescription:
      "This lab runs on its own admin screen so domain verification, guarded active testing, and audit review stay separate from passive scans and policy editing.",
    boundaryTitle: "Guardrails",
    boundaryDescription:
      "This lab only tests verified public hostnames, stays on the original origin, and limits itself to safe GET, HEAD, and OPTIONS requests. It does not brute-force accounts, change data, or persist payloads.",
    verificationTitle: "Ownership verification",
    verificationDescription:
      "Start with a DNS TXT, HTTP file, or HTML meta challenge so the system can confirm the domain belongs to your organization before any active test begins.",
    readOnlyTitle: "Read-only execution",
    readOnlyDescription:
      "The active test reuses the passive baseline, plans safe probes, and records every request, finding, and modeled chain for later audit review.",
    startFresh: "Start fresh",
    refresh: "Refresh activity",
    refreshFailed: "Failed to refresh authorized testing activity.",
    targetLabel: "Target URL",
    targetPlaceholder: "https://app.example.com",
    targetRequired: "Enter a public verified target URL before continuing.",
    methodLabel: "Verification method",
    challengeSetup: "Challenge setup",
    createChallenge: "Create challenge",
    creatingChallenge: "Creating challenge...",
    challengeToken: "Challenge token",
    verificationFailed: "Failed to create the ownership challenge.",
    verificationCheckFailed: "Failed to check the ownership challenge.",
    verificationSelectionRequired:
      "Select a verified ownership challenge before starting the run.",
    verificationRequiredHint:
      "Select a verification and confirm it is verified before running active checks.",
    verifiedReady: "The selected hostname is verified and ready for a guarded run.",
    verifiedHostname: "Verified hostname",
    selectedVerification: "Selected verification",
    selectVerification: "Choose a verification",
    recentVerifications: "Recent verifications",
    noVerifications: "No ownership challenges have been created yet.",
    useVerification: "Use verification",
    checkStatus: "Check status",
    checking: "Checking...",
    expiresAt: "Expires",
    verifiedAt: "Verified",
    challengeInstructions: "Challenge instructions",
    runConfig: "Run configuration",
    startRun: "Start a guarded run",
    run: "Run test",
    running: "Running...",
    runFailed: "Authorized test run failed.",
    reportLoadFailed: "Failed to load the selected test report.",
    modulesLabel: "Test modules",
    moduleSelectionRequired: "Select at least one active testing module.",
    maxPages: "Max pages",
    maxRequests: "Max requests",
    includeProfiles: "Include differential auth profiles",
    profileDescription:
      "Optional. Provide low-privilege and high-privilege request context as JSON with `headers` and `cookies` objects so the lab can compare authorization behavior safely.",
    lowPrivilegeProfile: "Low-privilege profile JSON",
    highPrivilegeProfile: "High-privilege profile JSON",
    authEndpointDescriptors: "Declared auth endpoints",
    authEndpointDescriptorDescription:
      "Optional. Provide same-origin staging login metadata as a JSON array so the lab can recognize client-rendered authentication flows and focus passive checks without submitting credentials.",
    authEndpointDescriptorArrayError:
      "Declared auth endpoint JSON must be an array.",
    authEndpointDescriptorObjectError:
      "Each declared auth endpoint entry must be an object.",
    authEndpointDescriptorStringArrayError:
      "Declared auth endpoint fields and tokenFields must be string arrays.",
    authEndpointDescriptorRequiredFieldError:
      "Each declared auth endpoint needs name, entryUrl, endpoint, and at least one field.",
    authEndpointDescriptorPlaceholder:
      '[\n  {\n    "type": "auth_api",\n    "name": "corporate-login",\n    "entryUrl": "https://staging.example.com/login",\n    "endpoint": "https://staging.example.com/api/login",\n    "fields": ["corporateId", "userId", "password"],\n    "tokenFields": ["mfsapiin"]\n  }\n]',
    manualFormValidation: "Manual POST form validation",
    manualFormValidationDescription:
      "Optional. Record operator-only POST login validation notes, labeled test credentials, and a guarded request-rate cap. The backend still keeps automated execution read-only.",
    manualFormValidationRateLimit: "Rate limit per minute",
    manualFormValidationCredentialLabels: "Test credential labels",
    manualFormValidationCredentialPlaceholder:
      "qa-corporate-admin\nqa-low-privilege",
    manualFormValidationNotes: "Operator notes",
    manualFormValidationNotesPlaceholder:
      "Document the intended login flow or inert payloads for manual validation only.",
    manualFormValidationCredentialRequired:
      "Add at least one test credential label before enabling manual POST form validation.",
    profileJsonObjectError: "Auth profile JSON must be an object.",
    profileJsonStringMapError:
      "Auth profile headers and cookies must be string-to-string objects.",
    profilePlaceholder:
      '{\n  "headers": {\n    "Authorization": "Bearer ..."\n  },\n  "cookies": {\n    "session": "..." \n  }\n}',
    recentRuns: "Recent runs",
    noRuns: "No authorized active runs have been recorded yet.",
    loadingReport: "Loading report...",
    findingsCount: "{count} findings",
    highFindingsCount: "{count} high",
    empty: "Create a verification or open a previous run to inspect a full authorized testing report.",
    executedAt: "Executed",
    executiveSummary: "Executive summary",
    modulesExecuted: "Modules executed",
    recommendedActions: "Recommended actions",
    guardrails: "Guardrails",
    baseline: "Passive baseline",
    score: "Security score",
    pagesScanned: "Pages scanned",
    aiAnalysis: "AI remediation analysis",
    aiUnavailable: "AI analysis unavailable",
    aiUnavailableDescription:
      "The deterministic report completed, but the configured model did not return an AI summary for this run.",
    runNotes: "Run notes",
    highFindings: "High findings",
    mediumFindings: "Medium findings",
    lowFindings: "Low findings",
    authProfiles: "Auth profiles",
    executionInsights: "Execution insights",
    parallelism: "Module parallelism",
    cacheHits: "Probe cache hits",
    cacheMisses: "Probe cache misses",
    rateLimits: "Rate-limited responses",
    backoffEvents: "Adaptive backoffs",
    networkRequests: "Network requests",
    prioritizedModules: "Prioritized modules",
    priorityScore: "Score {score}",
    plan: "Execution plan",
    safeMethod: "Safe method",
    attackPaths: "Modeled attack paths",
    safeValidation: "Safe validation",
    predictions: "Predicted risks",
    noPredictions:
      "No additional follow-on risks were predicted from the current passive baseline and read-only findings.",
    findings: "Confirmed findings",
    noFindings:
      "No finding was confirmed inside the current read-only coverage window. That does not replace code review or deeper authenticated testing.",
    noneRecorded: "None recorded in this run window.",
    indicators: "Indicators",
    recommendedCheck: "Recommended check",
    confidence: "Confidence",
    apiSignal: "API signal",
    vulnerabilityType: "Vulnerability type",
    declaredAuthEndpoints: "Declared auth endpoints",
    entryUrl: "Entry URL",
    endpoint: "Endpoint",
    httpMethod: "Method",
    signalConfidence: "Signal confidence",
    safePoc: "Safe proof of concept",
    validationRationale: "Validation rationale",
    remediation: "Remediation",
    safeRetest: "Safe retest",
    timeline: "Audit timeline",
    methods: {
      dns_txt: "DNS TXT",
      http_file: "HTTP file",
      html_meta: "HTML meta"
    },
    modules: {
      sql_injection: "SQL injection",
      xss: "XSS",
      csrf: "CSRF",
      authentication: "Authentication",
      authorization: "Authorization",
      api_security: "API security",
      ssrf: "SSRF",
      open_redirect: "Open redirect",
      business_logic: "Business logic",
      oauth_flow: "OAuth flow",
      waf: "WAF normalization",
      session_management: "Session management"
    },
    statuses: {
      pending: "Pending",
      verified: "Verified",
      failed: "Failed",
      expired: "Expired"
    },
    runStatuses: {
      planned: "Planned",
      running: "Running",
      completed: "Completed",
      failed: "Failed"
    },
    planSources: {
      ai: "AI plan",
      deterministic: "Deterministic plan"
    },
    riskLevels: {
      low: "Low risk",
      medium: "Medium risk",
      high: "High risk",
      critical: "Critical risk"
    },
    severities: {
      info: "Info",
      low: "Low severity",
      medium: "Medium severity",
      high: "High severity"
    },
    validationStatuses: {
      confirmed: "Confirmed",
      needs_review: "Needs review",
      unlikely: "Unlikely"
    },
    likelihoods: {
      low: "Low likelihood",
      medium: "Medium likelihood",
      high: "High likelihood"
    },
    vulnerabilityTypes: {
      idor: "IDOR",
      mass_assignment: "Mass assignment",
      auth_bypass: "Auth bypass",
      rate_limiting: "Rate limiting",
      data_leakage: "Data leakage",
      sql_injection: "SQL injection",
      xss: "XSS",
      csrf: "CSRF",
      ssrf: "SSRF",
      open_redirect: "Open redirect",
      oauth_flow: "OAuth flow"
    },
    sources: {
      ai: "AI-assisted",
      heuristic: "Heuristic"
    },
    priorities: {
      immediate: "Fix now",
      next: "Fix next",
      hardening: "Hardening"
    },
    pathStatuses: {
      blocked: "Blocked",
      constrained: "Constrained",
      exposed: "Exposed"
    },
    eventTypes: {
      status: "Status",
      ownership: "Ownership",
      guardrail: "Guardrail",
      plan: "Plan",
      discovery: "Discovery",
      request: "Request",
      finding: "Finding",
      warning: "Warning",
      summary: "Summary"
    },
    requestsSent: "Requests"
  },
  metrics: {
    unavailable: "Metrics Unavailable",
    loadFailed: "Failed to load metrics.",
    conversations: "Conversations",
    conversationsChange: "+{count} in the last 7 days",
    indexedFiles: "Indexed Files",
    indexedFilesChange: "+{count} indexed in the last 24h",
    toolExecutions: "Tool Executions",
    toolExecutionsChange: "{rate}% success",
    localModelLatency: "Local Model Latency",
    providersAvailable: "{count} providers available",
    modelEndpointUnreachable: "Model endpoint unreachable"
  },
  policy: {
    navLabel: "Policies",
    launchDescription:
      "Open the policy console on its own screen to edit governance rules and review audit decisions separately.",
    screenTitle: "Policy management tool",
    screenDescription:
      "This policy console runs on its own admin screen so rule editing and audit review stay separate from other admin tools.",
    loadFailed: "Failed to load policies.",
    refreshFailed: "Refresh failed.",
    nameRequired: "Policy name is required.",
    saveFailed: "Failed to save policy.",
    deleteFailed: "Failed to delete policy.",
    modeFailed: "Failed to update workspace mode.",
    testFailed: "Policy test failed.",
    policies: "Policies",
    scopedRuleSets: "Scoped rule sets",
    editor: "Editor",
    editPolicy: "Edit policy",
    createPolicy: "Create policy",
    refresh: "Refresh",
    save: "Save",
    delete: "Delete",
    new: "New",
    name: "Name",
    mode: "Mode",
    description: "Description",
    metadataJson: "Metadata JSON",
    active: "Active",
    inactive: "Inactive",
    rules: "Rules",
    ruleSet: "Policy rule set",
    assignments: "Assignments",
    inheritanceTargets: "Inheritance targets",
    addRule: "Rule",
    addAssignment: "Assignment",
    remove: "Remove",
    workspaceMode: "Workspace Mode",
    activePolicyPosture: "Active policy posture",
    customPolicy: "Custom policy",
    selectCustomPolicy: "Select custom policy",
    apply: "Apply",
    policyTest: "Policy Test",
    dryRunAction: "Dry-run an action",
    action: "Action",
    tool: "Tool",
    model: "Model",
    provider: "Provider",
    contentPlaceholder: "Request content, prompt, or tool payload summary",
    evaluate: "Evaluate",
    approvalRequired: "approval required",
    auditLogs: "Audit Logs",
    latestPolicyDecisions: "Latest policy decisions",
    time: "Time",
    category: "Category",
    decision: "Decision",
    toolOrModel: "Tool / Model",
    scope: "Scope",
    created: "Policy created.",
    updated: "Policy updated.",
    deleted: "Policy deleted.",
    testCompleted: "Policy test completed.",
    workspaceModeSet: "Workspace mode set to {mode}.",
    roleScopes: "Role scopes",
    toolNames: "Tool names",
    workspaceRoles: "Workspace roles",
    modelPatterns: "Model patterns",
    conditionsJson: "Conditions JSON",
    priority: "Priority",
    enabled: "Enabled",
    assignmentType: "Assignment type",
    scopeId: "Scope ID",
    notRequired: "not required",
    requestMetadata: "Request metadata JSON",
    url: "URL",
    fileName: "File name",
    fileSize: "File size (bytes)",
    mimeType: "MIME type",
    sql: "SQL",
    roleOverride: "Role override",
    workspaceRoleOverride: "Workspace role override",
    system: "system",
    rulesCount: "{count} rules",
    assignmentsCount: "{count} assignments",
    noData: "n/a"
  },
  enums: {
    policyCategories: {
      code_generation: "Code generation",
      security_research: "Security research",
      vulnerability_analysis: "Vulnerability analysis",
      document_access: "Document access",
      external_url_access: "External URL access",
      agent_execution: "Agent execution",
      tool_usage: "Tool usage",
      file_uploads: "File uploads",
      database_queries: "Database queries",
      command_execution: "Command execution"
    },
    policyDecisions: {
      allow: "Allow",
      warn: "Warn",
      require_approval: "Require approval",
      deny: "Deny"
    },
    policyModes: {
      open: "Open",
      strict: "Strict",
      enterprise: "Enterprise",
      research: "Research",
      custom: "Custom"
    },
    policyScopes: {
      workspace: "Workspace",
      organization: "Organization",
      user: "User",
      global: "Global"
    },
    policyAssignmentTypes: {
      overlay: "Overlay",
      mode: "Mode",
      baseline: "Baseline"
    },
    roles: {
      super_admin: "Super Admin",
      admin: "Admin",
      manager: "Manager",
      developer: "Developer",
      viewer: "Viewer"
    },
    workspaceRoles: {
      owner: "Owner",
      admin: "Admin",
      member: "Member",
      viewer: "Viewer"
    },
    memoryTypes: {
      preference: "Preference",
      long_term: "Long-term",
      short_term: "Short-term"
    }
  }
} as const;

export default en;
