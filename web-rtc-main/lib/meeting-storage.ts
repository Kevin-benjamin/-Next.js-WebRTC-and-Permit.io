// Helper function to check if we're in browser environment
function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined"
}

export interface MeetingData {
  id: string
  title: string
  description: string
  accessType: "open" | "approval" | "email"
  allowedEmails: string
  createdAt: string
  createdBy: string
  creatorSessionId: string
  creatorUserId: string
  creatorEmail: string 
  participants: Participant[]
  pendingApprovals: PendingApproval[]
  isActive: boolean
}

export interface Participant {
  id: string
  name: string
  role: "admin" | "co-admin" | "participant"
  isAudioEnabled: boolean
  isVideoEnabled: boolean
  isSpeaking: boolean
  joinedAt: string
  userId: string // Added userId field for Permit.io integration
  email: string // Added email field for reference
}

export interface PendingApproval {
  id: string
  name: string
  email?: string
  requestedAt: string
  sessionId: string
}

// Simulate a global meeting registry
const GLOBAL_MEETINGS_KEY = "global-meetings-registry"

// Generate a unique session ID for this browser tab/window
function getSessionId(): string {
  if (!isBrowser()) return `server-session-${Date.now()}`

  let sessionId = sessionStorage.getItem("session-id")
  if (!sessionId) {
    sessionId = `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
    sessionStorage.setItem("session-id", sessionId)
  }
  return sessionId
}

// Check if current tab/session is the original meeting creator
export function isMeetingCreator(meetingId: string): boolean {
  if (!isBrowser()) return false

  // First check if this tab has the creator flag specifically for this meeting
  const creatorFlag = sessionStorage.getItem(`meeting-creator-${meetingId}`)
  console.log(`Checking creator flag for meeting ${meetingId}:`, creatorFlag)

  if (creatorFlag === "true") {
    console.log(`Session IS creator for meeting ${meetingId}`)
    return true
  }

  // If no creator flag, this is not the creator tab
  console.log(`Session is NOT creator for meeting ${meetingId}`)
  return false
}

// Mark current session as meeting creator (only called during meeting creation)
export function markAsCreator(meetingId: string): void {
  if (!isBrowser()) return

  sessionStorage.setItem(`meeting-creator-${meetingId}`, "true")
  console.log(`Marked session as creator for meeting ${meetingId}`)
}

// Check if user has stored credentials for this meeting (different from being creator)
export function hasStoredCredentials(meetingId: string): boolean {
  if (!isBrowser()) return false

  const storedUserInfo = localStorage.getItem(`user-${meetingId}`)
  return !!storedUserInfo
}

export function saveMeetingToGlobalRegistry(meeting: MeetingData) {
  if (!isBrowser()) {
    console.log("Not in browser, skipping save to registry")
    return
  }

  try {
    const registry = getGlobalMeetingsRegistry()
    registry[meeting.id] = meeting
    localStorage.setItem(GLOBAL_MEETINGS_KEY, JSON.stringify(registry))
    console.log("Meeting saved to registry:", meeting.id, meeting)

    // Also broadcast the meeting data to other tabs
    MeetingSync.getInstance().broadcast("meeting-created", meeting.id, meeting)
  } catch (error) {
    console.error("Error saving meeting to registry:", error)
  }
}

export function getMeetingFromGlobalRegistry(meetingId: string): MeetingData | null {
  if (!isBrowser()) {
    console.log("Not in browser, returning null")
    return null
  }

  try {
    const registry = getGlobalMeetingsRegistry()
    console.log("Getting meeting from registry:", meetingId, registry)
    return registry[meetingId] || null
  } catch (error) {
    console.error("Error getting meeting from registry:", error)
    return null
  }
}

export function getGlobalMeetingsRegistry(): Record<string, MeetingData> {
  if (!isBrowser()) return {}

  try {
    const registryData = localStorage.getItem(GLOBAL_MEETINGS_KEY)
    console.log("Registry data from localStorage:", registryData)
    return registryData ? JSON.parse(registryData) : {}
  } catch (error) {
    console.error("Error parsing registry data:", error)
    return {}
  }
}

export function updateMeetingInGlobalRegistry(meetingId: string, updates: Partial<MeetingData>) {
  if (!isBrowser()) return

  try {
    const registry = getGlobalMeetingsRegistry()
    if (registry[meetingId]) {
      registry[meetingId] = { ...registry[meetingId], ...updates }
      localStorage.setItem(GLOBAL_MEETINGS_KEY, JSON.stringify(registry))
      console.log("Meeting updated in registry:", meetingId, updates)
    }
  } catch (error) {
    console.error("Error updating meeting in registry:", error)
  }
}

export function generateMeetingId(): string {
  return Math.random().toString(36).substring(2, 15)
}

// Simulate meeting validation
export function validateMeetingAccess(meeting: MeetingData, userEmail?: string): boolean {
  if (!meeting.isActive) return false

  switch (meeting.accessType) {
    case "open":
      return true
    case "email":
      if (!userEmail) return false
      const allowedEmails = meeting.allowedEmails.split("\n").map((email) => email.trim())
      return allowedEmails.includes(userEmail)
    case "approval":
      return true
    default:
      return false
  }
}

// Create meeting with creator session tracking - Updated interface
export function createMeetingWithCreator(meetingData: {
  id: string
  title: string
  description: string
  accessType: "open" | "approval" | "email"
  allowedEmails: string
  createdAt: string
  createdBy: string
  creatorUserId: string
  creatorEmail: string
  participants: Participant[]
  isActive: boolean
}): MeetingData {
  const currentSessionId = getSessionId()
  const meetingWithCreator: MeetingData = {
    ...meetingData,
    creatorSessionId: currentSessionId,
    pendingApprovals: [],
  }

  console.log("Creating meeting with creator:", meetingWithCreator)
  saveMeetingToGlobalRegistry(meetingWithCreator)

  // Mark this session as the creator - ENSURE THIS IS CALLED
  markAsCreator(meetingData.id)
  console.log(`Creator flag set for meeting ${meetingData.id}`)

  return meetingWithCreator
}

// Server-side approval system functions (for API routes)
export function createApprovalRequest(
  meeting: MeetingData,
  name: string,
  email?: string,
  sessionId?: string,
): { approvalId: string; updatedMeeting: MeetingData } {
  const approvalId = `approval-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
  const approval: PendingApproval = {
    id: approvalId,
    name,
    email,
    requestedAt: new Date().toISOString(),
    sessionId: sessionId || `server-session-${Date.now()}`,
  }

  const updatedMeeting: MeetingData = {
    ...meeting,
    pendingApprovals: [...meeting.pendingApprovals, approval],
  }

  return { approvalId, updatedMeeting }
}

// Client-side approval system functions (for browser)
export function requestMeetingApproval(meetingId: string, name: string, email?: string): string {
  const meeting = getMeetingFromGlobalRegistry(meetingId)
  if (!meeting) throw new Error("Meeting not found")

  const approvalId = `approval-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
  const approval: PendingApproval = {
    id: approvalId,
    name,
    email,
    requestedAt: new Date().toISOString(),
    sessionId: getSessionId(),
  }

  const updatedApprovals = [...meeting.pendingApprovals, approval]
  updateMeetingInGlobalRegistry(meetingId, { pendingApprovals: updatedApprovals })

  // Broadcast approval request to admins
  MeetingSync.getInstance().broadcast("approval-request", meetingId, approval)

  return approvalId
}

export function approveMeetingRequest(meetingId: string, approvalId: string): boolean {
  const meeting = getMeetingFromGlobalRegistry(meetingId)
  if (!meeting) return false

  const approval = meeting.pendingApprovals.find((a) => a.id === approvalId)
  if (!approval) return false

  // Remove from pending approvals
  const updatedApprovals = meeting.pendingApprovals.filter((a) => a.id !== approvalId)
  updateMeetingInGlobalRegistry(meetingId, { pendingApprovals: updatedApprovals })

  // Broadcast approval to the requesting session
  MeetingSync.getInstance().broadcast("approval-granted", meetingId, { approvalId, sessionId: approval.sessionId })

  return true
}

export function rejectMeetingRequest(meetingId: string, approvalId: string): boolean {
  const meeting = getMeetingFromGlobalRegistry(meetingId)
  if (!meeting) return false

  const approval = meeting.pendingApprovals.find((a) => a.id === approvalId)
  if (!approval) return false

  // Remove from pending approvals
  const updatedApprovals = meeting.pendingApprovals.filter((a) => a.id !== approvalId)
  updateMeetingInGlobalRegistry(meetingId, { pendingApprovals: updatedApprovals })

  // Broadcast rejection to the requesting session
  MeetingSync.getInstance().broadcast("approval-rejected", meetingId, { approvalId, sessionId: approval.sessionId })

  return true
}

// Cross-tab communication for real-time updates
export class MeetingSync {
  private static instance: MeetingSync
  private broadcastChannel: BroadcastChannel | null = null
  private listeners: Map<string, (data: any) => void> = new Map()
  private lastUpdate: Map<string, string> = new Map() // Track last update to prevent loops

  private constructor() {
    if (!isBrowser()) return

    try {
      this.broadcastChannel = new BroadcastChannel("meeting-sync")
      this.broadcastChannel.addEventListener("message", this.handleMessage.bind(this))
      window.addEventListener("storage", this.handleStorageChange.bind(this))
    } catch (error) {
      console.error("Error initializing MeetingSync:", error)
    }
  }

  static getInstance(): MeetingSync {
    if (!MeetingSync.instance) {
      MeetingSync.instance = new MeetingSync()
    }
    return MeetingSync.instance
  }

  private handleMessage(event: MessageEvent) {
    const { type, meetingId, data } = event.data
    const listener = this.listeners.get(`${type}-${meetingId}`)
    if (listener) {
      listener(data)
    }

    // Handle meeting creation broadcasts
    if (type === "meeting-created") {
      console.log("Received meeting creation broadcast:", data)
      // Save the meeting data to this tab's registry
      const registry = getGlobalMeetingsRegistry()
      registry[meetingId] = data
      localStorage.setItem(GLOBAL_MEETINGS_KEY, JSON.stringify(registry))
    }
  }

  private handleStorageChange(event: StorageEvent) {
    // Handle global meetings registry changes
    if (event.key === GLOBAL_MEETINGS_KEY && event.newValue && event.newValue !== event.oldValue) {
      console.log("Global meetings registry updated:", event.newValue)
      // Notify listeners about registry updates
      const listener = this.listeners.get("registry-update")
      if (listener) {
        try {
          const newRegistry = JSON.parse(event.newValue)
          listener(newRegistry)
        } catch (error) {
          console.error("Error parsing registry update:", error)
        }
      }
    }

    // Only handle participant changes and prevent loops
    if (event.key?.startsWith("participants-") && event.newValue && event.newValue !== event.oldValue) {
      const meetingId = event.key.replace("participants-", "")

      // Prevent duplicate updates
      if (this.lastUpdate.get(event.key) === event.newValue) {
        return
      }

      this.lastUpdate.set(event.key, event.newValue)

      try {
        const newData = JSON.parse(event.newValue)
        const listener = this.listeners.get(`participants-update-${meetingId}`)
        if (listener) {
          listener(newData)
        }
      } catch (error) {
        console.error("Error parsing participant data:", error)
      }
    }
  }

  broadcast(type: string, meetingId: string, data: any) {
    if (this.broadcastChannel) {
      this.broadcastChannel.postMessage({ type, meetingId, data })
    }
  }

  subscribe(type: string, meetingId: string, callback: (data: any) => void) {
    const key = `${type}-${meetingId}`
    this.listeners.set(key, callback)
  }

  unsubscribe(type: string, meetingId: string) {
    const key = `${type}-${meetingId}`
    this.listeners.delete(key)
  }

  cleanup() {
    if (this.broadcastChannel) {
      this.broadcastChannel.close()
    }
    if (isBrowser()) {
      window.removeEventListener("storage", this.handleStorageChange.bind(this))
    }
    this.listeners.clear()
    this.lastUpdate.clear()
  }
}

// Helper functions for participant management - SIMPLIFIED
export function addParticipantToMeeting(meetingId: string, participant: Participant): Participant[] {
  if (!isBrowser()) return []

  const existingParticipants = getParticipantsFromStorage(meetingId)

  // Check if participant already exists (prevent duplicates)
  const existingIndex = existingParticipants.findIndex((p) => p.id === participant.id)

  let updatedParticipants: Participant[]
  if (existingIndex >= 0) {
    // Update existing participant
    updatedParticipants = [...existingParticipants]
    updatedParticipants[existingIndex] = participant
  } else {
    // Add new participant
    updatedParticipants = [...existingParticipants, participant]
  }

  // Only save to localStorage - let storage event handle the sync
  localStorage.setItem(`participants-${meetingId}`, JSON.stringify(updatedParticipants))

  return updatedParticipants
}

export function removeParticipantFromMeeting(meetingId: string, participantId: string): Participant[] {
  if (!isBrowser()) return []

  const existingParticipants = getParticipantsFromStorage(meetingId)
  const updatedParticipants = existingParticipants.filter((p) => p.id !== participantId)

  // Only save to localStorage - let storage event handle the sync
  localStorage.setItem(`participants-${meetingId}`, JSON.stringify(updatedParticipants))

  return updatedParticipants
}

export function updateParticipantInMeeting(
  meetingId: string,
  participantId: string,
  updates: Partial<Participant>,
): Participant[] {
  if (!isBrowser()) return []

  const existingParticipants = getParticipantsFromStorage(meetingId)
  const updatedParticipants = existingParticipants.map((p) => (p.id === participantId ? { ...p, ...updates } : p))

  // Only save to localStorage - let storage event handle the sync
  localStorage.setItem(`participants-${meetingId}`, JSON.stringify(updatedParticipants))

  return updatedParticipants
}

export function getParticipantsFromStorage(meetingId: string): Participant[] {
  if (!isBrowser()) return []

  const participantsData = localStorage.getItem(`participants-${meetingId}`)
  return participantsData ? JSON.parse(participantsData) : []
}

// Generate unique participant ID
export function generateParticipantId(): string {
  return `participant-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

// Get current session ID (exposed for debugging)
export function getCurrentSessionId(): string {
  return getSessionId()
}

// New function to store participant-to-userId mapping
export function storeParticipantUserId(meetingId: string, participantId: string, userId: string): void {
  if (!isBrowser()) return

  const mappingKey = `participant-userId-mapping-${meetingId}`
  const existingMapping = localStorage.getItem(mappingKey)
  const mapping = existingMapping ? JSON.parse(existingMapping) : {}

  mapping[participantId] = userId
  localStorage.setItem(mappingKey, JSON.stringify(mapping))

  console.log(`Stored participant-userId mapping: ${participantId} -> ${userId}`)
}

// New function to get userId from participantId
export function getParticipantUserId(meetingId: string, participantId: string): string | null {
  if (!isBrowser()) return null

  const mappingKey = `participant-userId-mapping-${meetingId}`
  const existingMapping = localStorage.getItem(mappingKey)

  if (!existingMapping) return null

  const mapping = JSON.parse(existingMapping)
  return mapping[participantId] || null
}
