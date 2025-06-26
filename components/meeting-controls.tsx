"use client"

import { Button } from "@/components/ui/button"
import { Mic, MicOff, Video, VideoOff, Phone, Settings, Share, MessageSquare } from "lucide-react"
import { toast } from "sonner"

interface UserRole {
  role: "admin" | "co-admin" | "participant"
  userId: string
  permissions: string[]
}

interface MeetingControlsProps {
  isAudioEnabled: boolean
  isVideoEnabled: boolean
  onToggleAudio: () => void
  onToggleVideo: () => void
  onLeaveMeeting: () => void
  userRole: UserRole | null
  meetingId: string
}

export function MeetingControls({
  isAudioEnabled,
  isVideoEnabled,
  onToggleAudio,
  onToggleVideo,
  onLeaveMeeting,
  userRole,
  meetingId,
}: MeetingControlsProps) {
  const canControlAudio = () => {
    if (userRole?.role !== "participant") return true

    // Check if participant has speaking permission
    const permissions = localStorage.getItem(`user-permissions-${meetingId}-current-user`)
    const perms = permissions ? JSON.parse(permissions) : ["listen"]
    return perms.includes("speak")
  }

  const canControlVideo = () => {
    if (userRole?.role !== "participant") return true

    // Check if participant has speaking permission
    const permissions = localStorage.getItem(`user-permissions-${meetingId}-current-user`)
    const perms = permissions ? JSON.parse(permissions) : ["listen"]
    return perms.includes("speak")
  }
  const isAdmin = userRole?.role === "admin" || userRole?.role === "co-admin"

  const shareInviteLink = () => {
    const inviteLink = `${window.location.origin}/meeting/${meetingId}`
    navigator.clipboard.writeText(inviteLink)
    toast.error("Invite link copied to clipboard!")
  }

  const endMeeting = () => {
    if (confirm("Are you sure you want to end this meeting for everyone?")) {
      // In a real app, this would notify all participants
      localStorage.removeItem(`meeting-${meetingId}`)
      localStorage.removeItem(`participants-${meetingId}`)
      onLeaveMeeting()
    }
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-gray-800 border-t border-gray-700 p-4">
      <div className="flex items-center justify-center space-x-4">
        {/* Audio Control */}
        <Button
          onClick={onToggleAudio}
          disabled={!canControlAudio()}
          variant={isAudioEnabled ? "default" : "destructive"}
          size="lg"
          className="rounded-full cursor-pointer w-12 h-12"
        >
          {isAudioEnabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
        </Button>

        {/* Video Control */}
        <Button
          onClick={onToggleVideo}
          disabled={!canControlVideo()}
          variant={isVideoEnabled ? "default" : "destructive"}
          size="lg"
          className="rounded-full cursor-pointer w-12 h-12"
        >
          {isVideoEnabled ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
        </Button>

        {/* Share Invite */}
        <Button onClick={shareInviteLink} variant="outline" size="lg" className="rounded-full cursor-pointer border-none !bg-slate-600 w-12 h-12">
          <Share color="white" className="h-5 w-5" />
        </Button>

        {/* Chat (placeholder) */}
        <Button variant="outline" size="lg" className="rounded-full cursor-pointer border-none !bg-slate-600 w-12 h-12">
          <MessageSquare color="white" className="h-5 w-5" />
        </Button>

        {/* Settings (for admins) */}
        {isAdmin && (
          <Button variant="outline" size="lg" className="rounded-full cursor-pointer border-none !bg-slate-600 w-12 h-12">
            <Settings color="white" className="h-5 w-5" />
          </Button>
        )}

        {/* End Meeting (admin only) */}
        {userRole?.role === "admin" && (
          <Button onClick={endMeeting} variant="destructive" size="lg" className="ml-8">
            End Meeting
          </Button>
        )}

        {/* Leave Meeting */}
        <Button onClick={onLeaveMeeting} variant="destructive" size="lg" className="rounded-full w-12 h-12">
          <Phone className="h-5 w-5" />
        </Button>
      </div>

      {/* Role-based restrictions notice */}
      {userRole?.role === "participant" && !canControlAudio() && (
        <div className="text-center mt-2">
          <p className="text-xs text-gray-400">
            You are in listen-only mode. Ask an admin to grant speaking permissions.
          </p>
        </div>
      )}
    </div>
  )
}
