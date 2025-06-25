"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Crown, Shield, Users, Mic, MicOff, MoreVertical, UserPlus, UserMinus } from "lucide-react"
import {
  updateParticipantInMeeting,
  removeParticipantFromMeeting,
  MeetingSync,
  getParticipantUserId,
} from "@/lib/meeting-storage"
import { toast } from "sonner"

interface Participant {
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

interface UserRole {
  role: "admin" | "co-admin" | "participant"
  userId: string
  permissions: string[]
}

interface ParticipantsListProps {
  participants: Participant[]
  userRole: UserRole | null
  meetingId: string
  onParticipantsUpdate: (participants: Participant[]) => void
}

export function ParticipantsList({ participants, userRole, meetingId, onParticipantsUpdate }: ParticipantsListProps) {
  const [userCurrentRole, setUserCurrentRole] = useState<UserRole | null>(userRole)
  const canManageParticipants = userCurrentRole?.role === "admin" || userCurrentRole?.role === "co-admin"
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)
  const [loadingOperations, setLoadingOperations] = useState<Set<string>>(new Set())

  useEffect(() => {
    setUserCurrentRole(userRole);
  }, [userRole]);

  // Subscribe to role updates from other tabs
  useEffect(() => {
    const meetingSync = MeetingSync.getInstance()

    meetingSync.subscribe("role-update", meetingId, (data: { participantId: string; role: any }) => {
      console.log("Received role update:", data)
      // Update the participant's role in the local state
      const updatedParticipants = updateParticipantInMeeting(meetingId, data.participantId, {
        role: data.role.role,
      })
      onParticipantsUpdate(updatedParticipants)
    })

    meetingSync.subscribe("permission-update", meetingId, (data: { participantId: string; permissions: string[] }) => {
      console.log("Received permission update:", data)
      // Permissions are handled via localStorage, so we just need to trigger a re-render
      // The UI will read the updated permissions from localStorage
    })

    return () => {
      meetingSync.unsubscribe("role-update", meetingId)
      meetingSync.unsubscribe("permission-update", meetingId)
    }
  }, [meetingId, onParticipantsUpdate])

  const getRoleIcon = (role: string) => {
    switch (role) {
      case "admin":
        return <Crown className="h-4 w-4 text-yellow-500" />
      case "co-admin":
        return <Shield className="h-4 w-4 text-blue-500" />
      default:
        return <Users className="h-4 w-4 text-gray-500" />
    }
  }

  const muteParticipant = (participantId: string) => {
    console.log("Muting participant:", participantId)
    const updatedParticipants = updateParticipantInMeeting(meetingId, participantId, { isAudioEnabled: false })
    onParticipantsUpdate(updatedParticipants)
    setOpenDropdown(null)
  }

  const unmuteParticipant = (participantId: string) => {
    console.log("Unmuting participant:", participantId)
    const updatedParticipants = updateParticipantInMeeting(meetingId, participantId, { isAudioEnabled: true })
    onParticipantsUpdate(updatedParticipants)
    setOpenDropdown(null)
  }

  const promoteToCoAdmin = async (participantId: string) => {
    if (loadingOperations.has(`promote-${participantId}`)) return

    setLoadingOperations((prev) => new Set(prev).add(`promote-${participantId}`))

    try {
      const participant = participants.find((p) => p.id === participantId)
      if (!participant) {
        toast.error("Participant not found")
        return
      }

      const currentUserInfo = localStorage.getItem(`user-${meetingId}`)
      const adminUserId = currentUserInfo ? JSON.parse(currentUserInfo).userId : null

      if (!adminUserId) {
        toast.error("Admin user not found")
        return
      }

      // Get the actual Permit.io userId for this participant
      let participantUserId = participant.userId

      // Fallback: try to get from mapping if not available in participant object
      if (!participantUserId) {
        participantUserId = getParticipantUserId(meetingId, participantId)
      }

      if (!participantUserId) {
        toast.error("Could not find user ID for participant")
        return
      }

      console.log("Promoting participant to co-admin:", {
        participantId,
        participantUserId,
        participant,
        adminUserId,
      })

      const response = await fetch("/api/update-role", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: participantUserId, // Use the actual Permit.io userId
          meetingId,
          newRole: "co-admin",
          adminUserId,
        }),
      })

      const data = await response.json()

      if (data.success) {
        // Update local participant data
        const updatedParticipants = updateParticipantInMeeting(meetingId, participantId, { role: "co-admin" })
        console.log("Updated participant: 🔥 🔥 🔥 🔥 🔥 🔥", { updatedParticipants })
        onParticipantsUpdate(updatedParticipants)

        // Update role in localStorage
        const newRole = {
          role: "co-admin" as const,
          userId: participantId,
          permissions: ["mute", "unmute", "appointSpeaker"],
        }
        setUserCurrentRole(
          {
            role: "co-admin",
            userId: participantId,
            permissions: ["mute", "unmute", "appointSpeaker"],
          }
        )
        localStorage.setItem(`user-role-${meetingId}-${participantId}`, JSON.stringify(newRole))

        // Broadcast role change to other tabs
        MeetingSync.getInstance().broadcast("role-update", meetingId, { participantId, role: newRole })

        console.log("Successfully promoted participant to co-admin")
      } else {
        toast.error(data.error || "Failed to promote user")
      }
    } catch (error) {
      console.error("Error promoting user:", error)
      toast.error("Failed to promote user")
    } finally {
      setLoadingOperations((prev) => {
        const newSet = new Set(prev)
        newSet.delete(`promote-${participantId}`)
        return newSet
      })
    }

    setOpenDropdown(null)
  }

  const grantSpeakingPermission = (participantId: string) => {
    console.log("Granting speaking permission:", participantId)
    // Get current participant permissions
    const currentPermissions = localStorage.getItem(`user-permissions-${meetingId}-${participantId}`)
    const permissions = currentPermissions ? JSON.parse(currentPermissions) : ["listen"]

    if (!permissions.includes("speak")) {
      permissions.push("speak")
      localStorage.setItem(`user-permissions-${meetingId}-${participantId}`, JSON.stringify(permissions))

      // Broadcast permission change
      MeetingSync.getInstance().broadcast("permission-update", meetingId, { participantId, permissions })
    }
    setOpenDropdown(null)
  }

  const revokeSpeakingPermission = (participantId: string) => {
    console.log("Revoking speaking permission:", participantId)
    // Get current participant permissions
    const currentPermissions = localStorage.getItem(`user-permissions-${meetingId}-${participantId}`)
    let permissions = currentPermissions ? JSON.parse(currentPermissions) : ["listen"]

    permissions = permissions.filter((p: string) => p !== "speak")
    localStorage.setItem(`user-permissions-${meetingId}-${participantId}`, JSON.stringify(permissions))

    // Also mute the participant when revoking speaking permission
    const updatedParticipants = updateParticipantInMeeting(meetingId, participantId, { isAudioEnabled: false })
    onParticipantsUpdate(updatedParticipants)

    // Broadcast permission change
    MeetingSync.getInstance().broadcast("permission-update", meetingId, { participantId, permissions })
    setOpenDropdown(null)
  }

  const demoteToParticipant = async (participantId: string) => {
    if (loadingOperations.has(`demote-${participantId}`)) return

    setLoadingOperations((prev) => new Set(prev).add(`demote-${participantId}`))

    try {
      const participant = participants.find((p) => p.id === participantId)
      if (!participant) {
        toast.error("Participant not found")
        return
      }

      const currentUserInfo = localStorage.getItem(`user-${meetingId}`)
      const adminUserId = currentUserInfo ? JSON.parse(currentUserInfo).userId : null

      if (!adminUserId) {
        toast.error("Admin user not found")
        return
      }

      // Get the actual Permit.io userId for this participant
      let participantUserId = participant.userId

      // Fallback: try to get from mapping if not available in participant object
      if (!participantUserId) {
        participantUserId = getParticipantUserId(meetingId, participantId)
      }

      if (!participantUserId) {
        toast.error("Could not find user ID for participant")
        return
      }

      console.log("Demoting participant to participant:", {
        participantId,
        participantUserId,
        participant,
        adminUserId,
      })

      const response = await fetch("/api/update-role", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: participantUserId, // Use the actual Permit.io userId
          meetingId,
          newRole: "participant",
          adminUserId,
        }),
      })

      const data = await response.json()

      if (data.success) {
        const updatedParticipants = updateParticipantInMeeting(meetingId, participantId, { role: "participant" })
        onParticipantsUpdate(updatedParticipants)

        const newRole = {
          role: "participant" as const,
          userId: participantId,
          permissions: ["listen"],
        }
        localStorage.setItem(`user-role-${meetingId}-${participantId}`, JSON.stringify(newRole))
        localStorage.setItem(`user-permissions-${meetingId}-${participantId}`, JSON.stringify(["listen"]))

        MeetingSync.getInstance().broadcast("role-update", meetingId, { participantId, role: newRole })

        console.log("Successfully demoted participant")
      } else {
        toast.error(data.error || "Failed to demote user")
      }
    } catch (error) {
      console.error("Error demoting user:", error)
      toast.error("Failed to demote user")
    } finally {
      setLoadingOperations((prev) => {
        const newSet = new Set(prev)
        newSet.delete(`demote-${participantId}`)
        return newSet
      })
    }

    setOpenDropdown(null)
  }

  const removeParticipant = async (participantId: string) => {
    if (loadingOperations.has(`remove-${participantId}`)) return

    setLoadingOperations((prev) => new Set(prev).add(`remove-${participantId}`))

    try {
      const participant = participants.find((p) => p.id === participantId)
      if (!participant) {
        toast.error("Participant not found")
        return
      }

      const currentUserInfo = localStorage.getItem(`user-${meetingId}`)
      const adminUserId = currentUserInfo ? JSON.parse(currentUserInfo).userId : null

      if (!adminUserId) {
        toast.error("Admin user not found")
        return
      }

      // Get the actual Permit.io userId for this participant
      let participantUserId = participant.userId

      // Fallback: try to get from mapping if not available in participant object
      if (!participantUserId) {
        participantUserId = getParticipantUserId(meetingId, participantId)
      }

      if (!participantUserId) {
        toast.error("Could not find user ID for participant")
        return
      }

      const response = await fetch("/api/remove-participant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: participantUserId, // Use the actual Permit.io userId
          meetingId,
          adminUserId,
        }),
      })

      const data = await response.json()

      if (data.success) {
        const updatedParticipants = removeParticipantFromMeeting(meetingId, participantId)
        onParticipantsUpdate(updatedParticipants)
      } else {
        toast.error(data.error || "Failed to remove participant")
      }
    } catch (error) {
      console.error("Error removing participant:", error)
      toast.error("Failed to remove participant")
    } finally {
      setLoadingOperations((prev) => {
        const newSet = new Set(prev)
        newSet.delete(`remove-${participantId}`)
        return newSet
      })
    }

    setOpenDropdown(null)
  }

  const toggleDropdown = (participantId: string) => {
    setOpenDropdown(openDropdown === participantId ? null : participantId)
  }

  // Helper function to check if participant has speaking permission
  const hasSeakingPermission = (participantId: string) => {
    const permissions = localStorage.getItem(`user-permissions-${meetingId}-${participantId}`)
    const perms = permissions ? JSON.parse(permissions) : ["listen"]
    return perms.includes("speak")
  }


  return (
    <Card className="h-full !bg-zinc-950">
      <CardHeader>
        <CardTitle className="flex items-center text-white">
          <Users className="h-5 w-5 mr-2" />
          Participants ({participants.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 p-4">
        {participants.map((participant) => (
          <div key={participant.id} className="flex items-center justify-between p-3 bg-gray-700 rounded-lg">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                <span className="text-sm font-semibold text-white">{participant.name.charAt(0).toUpperCase()}</span>
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-sm font-medium text-white">
                    {participant.name}
                    {participant.id === "current-user" && " (You)"}
                  </span>
                  {getRoleIcon(participant.role)}
                </div>
                <div className="flex items-center space-x-1 mt-1">
                  {participant.isAudioEnabled ? (
                    <Mic className={`h-3 w-3 ${participant.isSpeaking ? "text-green-400" : "text-gray-400"}`} />
                  ) : (
                    <MicOff className="h-3 w-3 text-red-400" />
                  )}
                  <span className="text-xs text-gray-400 capitalize">{participant.role}</span>
                  {participant.role === "participant" && (
                    <span className="text-xs text-blue-400">
                      {hasSeakingPermission(participant.id) ? "• Can Speak" : "• Listen Only"}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Admin Controls */}
            {canManageParticipants && participant.id !== "current-user" && (
              <div className="relative">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-gray-400 hover:text-white hover:bg-gray-600 h-8 w-8 p-0 rounded-full"
                  onClick={() => toggleDropdown(participant.id)}
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>

                {/* Custom Dropdown Menu */}
                {openDropdown === participant.id && (
                  <div className="absolute right-0 top-8 w-48 bg-gray-800 border border-gray-600 rounded-md shadow-lg z-50">
                    <div className="py-1">
                      {/* Audio Controls */}
                      {participant.isAudioEnabled ? (
                        <button
                          onClick={() => muteParticipant(participant.id)}
                          className="flex items-center w-full px-3 py-2 text-sm text-white hover:bg-gray-700 transition-colors"
                        >
                          <MicOff className="h-4 w-4 mr-2" />
                          Mute
                        </button>
                      ) : (
                        <button
                          onClick={() => unmuteParticipant(participant.id)}
                          className="flex items-center w-full px-3 py-2 text-sm text-white hover:bg-gray-700 transition-colors"
                        >
                          <Mic className="h-4 w-4 mr-2" />
                          Unmute
                        </button>
                      )}

                      {/* Speaking Permissions (for participants only) */}
                      {participant.role === "participant" && (
                        <>
                          {!hasSeakingPermission(participant.id) ? (
                            <button
                              onClick={() => grantSpeakingPermission(participant.id)}
                              className="flex items-center w-full px-3 py-2 text-sm text-white hover:bg-gray-700 transition-colors"
                            >
                              <UserPlus className="h-4 w-4 mr-2" />
                              Allow to Speak
                            </button>
                          ) : (
                            <button
                              onClick={() => revokeSpeakingPermission(participant.id)}
                              className="flex items-center w-full px-3 py-2 text-sm text-white hover:bg-gray-700 transition-colors"
                            >
                              <UserMinus className="h-4 w-4 mr-2" />
                              Revoke Speaking
                            </button>
                          )}
                        </>
                      )}

                      {/* Role Management (Admin only) */}
                      {userRole?.role === "admin" && (
                        <>
                          {participant.role === "participant" && (
                            <button
                              onClick={() => promoteToCoAdmin(participant.id)}
                              disabled={loadingOperations.has(`promote-${participant.id}`)}
                              className="flex items-center w-full px-3 py-2 text-sm text-white hover:bg-gray-700 transition-colors disabled:opacity-50"
                            >
                              <Shield className="h-4 w-4 mr-2" />
                              {loadingOperations.has(`promote-${participant.id}`) ? "Promoting..." : "Make Co-Admin"}
                            </button>
                          )}

                          {participant.role === "co-admin" && (
                            <button
                              onClick={() => demoteToParticipant(participant.id)}
                              disabled={loadingOperations.has(`demote-${participant.id}`)}
                              className="flex items-center w-full px-3 py-2 text-sm text-white hover:bg-gray-700 transition-colors disabled:opacity-50"
                            >
                              <Users className="h-4 w-4 mr-2" />
                              {loadingOperations.has(`demote-${participant.id}`) ? "Demoting..." : "Remove Co-Admin"}
                            </button>
                          )}
                        </>
                      )}

                      {/* Separator */}
                      <div className="h-px bg-gray-700 my-1" />

                      {/* Remove Participant */}
                      <button
                        onClick={() => removeParticipant(participant.id)}
                        disabled={loadingOperations.has(`remove-${participant.id}`)}
                        className="flex items-center w-full px-3 py-2 text-sm text-red-400 hover:bg-gray-700 transition-colors disabled:opacity-50"
                      >
                        <UserMinus className="h-4 w-4 mr-2" />
                        {loadingOperations.has(`remove-${participant.id}`) ? "Removing..." : "Remove from Meeting"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {participants.length === 0 && (
          <div className="text-center py-8 text-gray-400">
            <Users className="h-12 w-12 mx-auto mb-2" />
            <p>No participants yet</p>
          </div>
        )}

        {/* Click outside to close dropdown */}
        {openDropdown && <div className="fixed inset-0 z-40" onClick={() => setOpenDropdown(null)} />}
      </CardContent>
    </Card>
  )
}
