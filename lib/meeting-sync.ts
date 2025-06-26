export class MeetingSync {
  private static instance: MeetingSync
  private broadcastChannel: BroadcastChannel
  private listeners: Map<string, (data: any) => void> = new Map()

  private constructor() {
    this.broadcastChannel = new BroadcastChannel("meeting-sync")
    this.broadcastChannel.addEventListener("message", this.handleMessage.bind(this))

    // Listen for localStorage changes from other tabs
    window.addEventListener("storage", this.handleStorageChange.bind(this))
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
  }

  private handleStorageChange(event: StorageEvent) {
    if (event.key?.startsWith("participants-")) {
      const meetingId = event.key.replace("participants-", "")
      const newData = event.newValue ? JSON.parse(event.newValue) : []
      this.broadcast("participants-update", meetingId, newData)
    }
  }

  broadcast(type: string, meetingId: string, data: any) {
    this.broadcastChannel.postMessage({ type, meetingId, data })
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
    this.broadcastChannel.close()
    window.removeEventListener("storage", this.handleStorageChange.bind(this))
  }
}
