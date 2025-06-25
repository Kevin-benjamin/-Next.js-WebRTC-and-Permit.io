"use client"

import { useEffect, useState, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Phone, Users, Crown, Shield, UserCheck, Clock, CheckCircle } from "lucide-react"
import { ParticipantsList } from "@/components/participants-list"
import { MeetingControls } from "@/components/meeting-controls"
import { VideoGrid } from "@/components/video-grid"
import { ApprovalPanel } from "@/components/approval-panel"
import {
  getMeetingFromGlobalRegistry,
  MeetingSync,
  addParticipantToMeeting,
  removeParticipantFromMeeting,
  getParticipantsFromStorage,
  generateParticipantId,
  isMeetingCreator,
  hasStoredCredentials,
  saveMeetingToGlobalRegistry,
  storeParticipantUserId,
  type MeetingData,
  type Participant,
} from "@/lib/meeting-storage"
import { toast } from "sonner"

interface UserRole {
  role: "admin" | "co-admin" | "participant"
  userId: string
  permissions: string[]
}

interface UserInfo {
  userId: string
  email: string
  firstName: string
  lastName: string
  isCreator?: boolean
}

export default function MeetingPage() {
  const params = useParams()
  const router = useRouter()
  const meetingId = params.id as string

  const [meeting, setMeeting] = useState<MeetingData | null>(null)
  const [userRole, setUserRole] = useState<UserRole | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [isAudioEnabled, setIsAudioEnabled] = useState(true)
  const [isVideoEnabled, setIsVideoEnabled] = useState(true)
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [isJoined, setIsJoined] = useState(false)
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null)
  const [joinForm, setJoinForm] = useState({
    email: "",
    firstName: "",
    lastName: "",
  })
  const [currentParticipantId, setCurrentParticipantId] = useState<string | null>(null)
  const [showApprovalPanel, setShowApprovalPanel] = useState(false)
  const [pendingApprovalCount, setPendingApprovalCount] = useState(0)
  const [isJoining, setIsJoining] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [meetingNotFound, setMeetingNotFound] = useState(false)

  // Approval states
  const [approvalStatus, setApprovalStatus] = useState<{
    requiresApproval: boolean
    approvalId: string | null
    message: string
    isWaiting: boolean
  }>({
    requiresApproval: false,
    approvalId: null,
    message: "",
    isWaiting: false,
  })

  const localVideoRef = useRef<HTMLVideoElement>(null)

  // Function to fetch pending approval count
  const fetchPendingApprovalCount = async () => {
    if (userRole?.role !== "admin") return

    try {
      const response = await fetch(`/api/get-pending-approvals?meetingId=${meetingId}`)
      const data = await response.json()

      if (data.success) {
        const count = data.pendingApprovals?.length || 0
        setPendingApprovalCount(count)
        console.log("Updated pending approval count:", count)
      }
    } catch (error) {
      console.error("Error fetching pending approval count:", error)
    }
  }

  // Function to check approval status for waiting users
  const checkApprovalStatus = async () => {
    if (!approvalStatus.approvalId || !approvalStatus.isWaiting) return

    console.log("Checking approval status for:", approvalStatus.approvalId)

    try {
      // Try to join again with the same approval ID to check status
      const response = await fetch("/api/join", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          meetingId,
          email: joinForm.email,
          firstName: joinForm.firstName,
          lastName: joinForm.lastName,
          approvalId: approvalStatus.approvalId,
        }),
      })

      const data = await response.json()
      console.log("Approval status check response:", data)

      if (data.success) {
        // Approval was granted! Process the join
        console.log("Approval was granted, processing join...")

        // Update meeting data if we got it from the API
        if (data.meeting) {
          setMeeting(data.meeting)
          setMeetingNotFound(false)
          saveMeetingToGlobalRegistry(data.meeting)
        }

        // Store user info
        const userInfo: UserInfo = {
          userId: data.userId,
          email: joinForm.email,
          firstName: joinForm.firstName,
          lastName: joinForm.lastName,
          isCreator: false,
        }
        setUserInfo(userInfo)

        // Set role
        const userRole = data.userRole || (data.userRoles.length > 0 ? data.userRoles[0].role : "participant")
        setUserRole({
          role: userRole,
          userId: data.userId,
          permissions: [],
        })

        await initializeMedia()

        // Add participant to meeting
        const participantId = generateParticipantId()
        setCurrentParticipantId(participantId)

        // Store the participant-userId mapping
        storeParticipantUserId(meetingId, participantId, data.userId)

        const newParticipant: Participant = {
          id: participantId,
          name: `${joinForm.firstName} ${joinForm.lastName}`,
          role: userRole,
          isAudioEnabled: true,
          isVideoEnabled: true,
          isSpeaking: false,
          joinedAt: new Date().toISOString(),
          userId: data.userId, // Store the actual Permit.io userId
          email: joinForm.email,
        }

        const updatedParticipants = addParticipantToMeeting(meetingId, newParticipant)
        setParticipants(updatedParticipants)
        setIsJoined(true)

        // Clear approval status
        setApprovalStatus({
          requiresApproval: false,
          approvalId: null,
          message: "",
          isWaiting: false,
        })
      } else if (data.requiresApproval && data.message.includes("pending")) {
        // Still waiting for approval
        console.log("Still waiting for approval")
        setApprovalStatus((prev) => ({
          ...prev,
          message: data.message,
        }))
      } else if (data.error && data.error.includes("rejected")) {
        // Request was rejected
        console.log("Request was rejected")
        setApprovalStatus((prev) => ({
          ...prev,
          requiresApproval: false,
          message: "Your request to join was rejected by the meeting host.",
          isWaiting: false,
        }))
      }
    } catch (error) {
      console.error("Error checking approval status:", error)
    }
  }

  useEffect(() => {
    console.log("=== MEETING PAGE DEBUG ===")
    console.log("Meeting ID:", meetingId)

    // Check session storage directly
    const creatorFlag = sessionStorage.getItem(`meeting-creator-${meetingId}`)
    console.log("Creator flag from sessionStorage:", creatorFlag)

    // Check localStorage for user info
    const storedUserInfo = localStorage.getItem(`user-${meetingId}`)
    console.log("Stored user info from localStorage:", storedUserInfo)

    // Check if this is the creator session (based on sessionStorage flag)
    const isCreator = isMeetingCreator(meetingId)
    console.log("Is creator session (from function):", isCreator)

    // Check if user has stored credentials (different from being creator)
    const hasCredentials = hasStoredCredentials(meetingId)
    console.log("Has stored credentials:", hasCredentials)

    // Load stored user info if available
    if (hasCredentials) {
      if (storedUserInfo) {
        const userInfo = JSON.parse(storedUserInfo)
        // Mark as creator if this is actually the creator session AND the stored info says they're creator
        const finalIsCreator = isCreator && userInfo.isCreator
        setUserInfo({ ...userInfo, isCreator: finalIsCreator })
        console.log("Set user info:", { ...userInfo, isCreator: finalIsCreator })
        console.log("Final creator status:", finalIsCreator)
      }
    }

    // Load meeting data with multiple fallback strategies
    let meetingData = getMeetingFromGlobalRegistry(meetingId)
    console.log("Meeting data from registry:", meetingData)

    if (!meetingData) {
      console.log("No meeting data found in registry, trying fallbacks...")

      // Try to load from old localStorage format as fallback
      const oldMeetingData = localStorage.getItem(`meeting-${meetingId}`)
      if (oldMeetingData) {
        console.log("Found meeting in old format, migrating...")
        const parsedMeeting = JSON.parse(oldMeetingData)
        // Add missing fields for compatibility
        meetingData = {
          ...parsedMeeting,
          creatorUserId: parsedMeeting.createdBy || "unknown",
          creatorEmail: "unknown@example.com",
          creatorSessionId: parsedMeeting.creatorSessionId || "unknown",
          pendingApprovals: parsedMeeting.pendingApprovals || [],
        }
        // Save migrated meeting to new registry
        saveMeetingToGlobalRegistry(meetingData)
        console.log("Migrated and saved meeting data")
      }
    }

    if (meetingData) {
      setMeeting(meetingData)
      setPendingApprovalCount(meetingData.pendingApprovals?.length || 0)
      console.log("Meeting set successfully")
    } else {
      console.log("No meeting data found anywhere")

      // If this is the creator and we have user info, create a basic meeting object
      if (isCreator && hasCredentials && storedUserInfo) {
        console.log("Creating fallback meeting for creator")
        const userInfo = JSON.parse(storedUserInfo)
        const fallbackMeeting: MeetingData = {
          id: meetingId,
          title: "My Meeting", // Default title
          description: "",
          accessType: "open",
          allowedEmails: "",
          createdAt: new Date().toISOString(),
          createdBy: userInfo.userId,
          creatorSessionId: sessionStorage.getItem("session-id") || "unknown",
          creatorUserId: userInfo.userId,
          creatorEmail: userInfo.email,
          participants: [],
          pendingApprovals: [],
          isActive: true,
        }
        setMeeting(fallbackMeeting)
        saveMeetingToGlobalRegistry(fallbackMeeting)
        console.log("Created and saved fallback meeting")
      } else {
        // For participants, we'll let the join API handle finding the meeting
        console.log("No meeting data for participant - will be handled by join API")
      }
    }

    // Load participants
    const initialParticipants = getParticipantsFromStorage(meetingId)
    console.log("Initial participants:", initialParticipants)
    setParticipants(initialParticipants)

    // Set up real-time sync
    const meetingSync = MeetingSync.getInstance()
    meetingSync.subscribe("participants-update", meetingId, (updatedParticipants: Participant[]) => {
      console.log("Received participant update:", updatedParticipants)
      setParticipants(updatedParticipants)
    })

    // Subscribe to meeting creation broadcasts (for participants joining)
    meetingSync.subscribe("meeting-created", meetingId, (meetingData: MeetingData) => {
      console.log("Received meeting creation broadcast:", meetingData)
      setMeeting(meetingData)
      setMeetingNotFound(false)
    })

    // Subscribe to registry updates
    meetingSync.subscribe("registry-update", "", (registry: Record<string, MeetingData>) => {
      console.log("Registry updated:", registry)
      if (registry[meetingId]) {
        setMeeting(registry[meetingId])
        setMeetingNotFound(false)
      }
    })

    // Subscribe to approval updates
    meetingSync.subscribe("approval-granted", meetingId, (data: { approvalId: string; sessionId: string }) => {
      const currentSessionId = sessionStorage.getItem("session-id")
      console.log("Received approval-granted broadcast:", data, "Current session:", currentSessionId)

      if (data.sessionId === currentSessionId && data.approvalId === approvalStatus.approvalId) {
        console.log("Approval granted for this session!")
        setApprovalStatus((prev) => ({
          ...prev,
          requiresApproval: false,
          message: "Your request has been approved! You can now join the meeting.",
          isWaiting: false,
        }))

        // Automatically try to join after a short delay
        setTimeout(() => {
          console.log("Auto-joining after approval...")
          checkApprovalStatus()
        }, 1000)
      }
    })

    meetingSync.subscribe("approval-rejected", meetingId, (data: { approvalId: string; sessionId: string }) => {
      const currentSessionId = sessionStorage.getItem("session-id")
      console.log("Received approval-rejected broadcast:", data, "Current session:", currentSessionId)

      if (data.sessionId === currentSessionId && data.approvalId === approvalStatus.approvalId) {
        console.log("Approval rejected for this session")
        setApprovalStatus((prev) => ({
          ...prev,
          requiresApproval: false,
          message: "Your request to join was rejected by the meeting host.",
          isWaiting: false,
        }))
      }
    })

    setIsLoading(false)
    console.log("=== END MEETING PAGE DEBUG ===")

    return () => {
      meetingSync.unsubscribe("participants-update", meetingId)
      meetingSync.unsubscribe("meeting-created", meetingId)
      meetingSync.unsubscribe("registry-update", "")
      meetingSync.unsubscribe("approval-granted", meetingId)
      meetingSync.unsubscribe("approval-rejected", meetingId)
    }
  }, [meetingId, approvalStatus.approvalId])

  // Listen for role updates
  useEffect(() => {
    for (const participant of participants) {
      if (participant.id === currentParticipantId) {
        setUserRole({
          role: participant.role as "admin" | "co-admin" | "participant",
          userId: currentParticipantId || "",
          permissions: [], // Add appropriate permissions if available
        });
        console.log("Updated userRole:", participant.role);
      }
    }
  }, [meetingId, participants]);

  // Set up polling for approval count when user is admin
  useEffect(() => {
    if (userRole?.role === "admin" && isJoined) {
      // Initial fetch
      fetchPendingApprovalCount()

      // Set up polling every 10 seconds
      const pollInterval = setInterval(() => {
        fetchPendingApprovalCount()
      }, 10000)

      return () => {
        clearInterval(pollInterval)
      }
    }
  }, [userRole, isJoined, meetingId])

  // Set up polling for approval status when user is waiting
  useEffect(() => {
    if (approvalStatus.isWaiting && approvalStatus.approvalId) {
      console.log("Setting up approval status polling for:", approvalStatus.approvalId)

      // Check immediately
      checkApprovalStatus()

      // Set up polling every 3 seconds while waiting
      const pollInterval = setInterval(() => {
        checkApprovalStatus()
      }, 3000)

      return () => {
        console.log("Cleaning up approval status polling")
        clearInterval(pollInterval)
      }
    }
  }, [approvalStatus.isWaiting, approvalStatus.approvalId, joinForm.email, joinForm.firstName, joinForm.lastName])

  const initializeMedia = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "user",
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
      })

      setLocalStream(stream)

      setTimeout(() => {
        if (localVideoRef.current && stream) {
          localVideoRef.current.srcObject = stream
          localVideoRef.current.play().catch((error) => {
            console.error("Error playing video:", error)
          })
        }
      }, 100)
    } catch (error) {
      console.error("Error accessing media devices:", error)
      toast.error("Could not access camera/microphone. Please check permissions and try again.")
    }
  }

  const joinMeeting = async () => {
    if (!joinForm.email.trim() || !joinForm.firstName.trim() || !joinForm.lastName.trim()) {
      toast.error("Please fill in all required fields")
      return
    }

    setIsJoining(true)

    try {
      console.log("Attempting to join meeting:", meetingId)

      // Join meeting via API to get Permit.io roles and meeting data
      const response = await fetch("/api/join", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          meetingId,
          email: joinForm.email,
          firstName: joinForm.firstName,
          lastName: joinForm.lastName,
          approvalId: approvalStatus.approvalId, // Include approval ID if we have one
        }),
      })

      const data = await response.json()
      console.log("Join API response:", data)

      if (data.success) {
        // Update meeting data if we got it from the API
        if (data.meeting) {
          console.log("Setting meeting data from API response")
          setMeeting(data.meeting)
          setMeetingNotFound(false)
          // Save it to registry for future use
          saveMeetingToGlobalRegistry(data.meeting)
        }

        // Store user info (but don't mark as creator)
        const userInfo: UserInfo = {
          userId: data.userId,
          email: joinForm.email,
          firstName: joinForm.firstName,
          lastName: joinForm.lastName,
          isCreator: false,
        }
        setUserInfo(userInfo)

        // Determine role from Permit.io response
        const userRole = data.userRole || (data.userRoles.length > 0 ? data.userRoles[0].role : "participant")
        setUserRole({
          role: userRole,
          userId: data.userId,
          permissions: [], // Will be fetched from Permit.io
        })

        await initializeMedia()

        // Generate participant ID and add to meeting
        const participantId = generateParticipantId()
        setCurrentParticipantId(participantId)

        // Store the participant-userId mapping
        storeParticipantUserId(meetingId, participantId, data.userId)

        const newParticipant: Participant = {
          id: participantId,
          name: `${joinForm.firstName} ${joinForm.lastName}`,
          role: userRole,
          isAudioEnabled: true,
          isVideoEnabled: true,
          isSpeaking: false,
          joinedAt: new Date().toISOString(),
          userId: data.userId, // Store the actual Permit.io userId
          email: joinForm.email,
        }

        const updatedParticipants = addParticipantToMeeting(meetingId, newParticipant)
        setParticipants(updatedParticipants)
        setIsJoined(true)

        // Clear approval status
        setApprovalStatus({
          requiresApproval: false,
          approvalId: null,
          message: "",
          isWaiting: false,
        })
      } else {
        if (data.requiresApproval) {
          // Handle approval requirement
          console.log("Setting approval status:", data)
          setApprovalStatus({
            requiresApproval: true,
            approvalId: data.approvalId,
            message: data.message,
            isWaiting: true,
          })
        } else {
          if (data.error === "Meeting not found") {
            setMeetingNotFound(true)
          }
          toast.error(data.error || "Failed to join meeting")
        }
      }
    } catch (error) {
      console.error("Error joining meeting:", error)
      toast.error("Failed to join meeting")
    } finally {
      setIsJoining(false)
    }
  }

  const startMeeting = async () => {
    if (!userInfo) return

    // For meeting creator, they already have admin role from creation
    setUserRole({
      role: "admin",
      userId: userInfo.userId,
      permissions: ["mute", "unmute", "endMeeting", "appointCoAdmin", "appointSpeaker", "bypassApproval"],
    })

    await initializeMedia()

    const participantId = generateParticipantId()
    setCurrentParticipantId(participantId)

    // Store the participant-userId mapping for the creator too
    storeParticipantUserId(meetingId, participantId, userInfo.userId)

    const newParticipant: Participant = {
      id: participantId,
      name: `${userInfo.firstName} ${userInfo.lastName}`,
      role: "admin",
      isAudioEnabled: true,
      isVideoEnabled: true,
      isSpeaking: false,
      joinedAt: new Date().toISOString(),
      userId: userInfo.userId, // Store the actual Permit.io userId
      email: userInfo.email,
    }

    const updatedParticipants = addParticipantToMeeting(meetingId, newParticipant)
    setParticipants(updatedParticipants)
    setIsJoined(true)
  }

  const leaveMeeting = () => {
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop())
    }

    if (currentParticipantId) {
      removeParticipantFromMeeting(meetingId, currentParticipantId)
    }

    router.push("/")
  }

  const toggleAudio = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0]
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled
        setIsAudioEnabled(audioTrack.enabled)
      }
    }
  }

  const toggleVideo = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0]
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled
        setIsVideoEnabled(videoTrack.enabled)
      }
    }
  }

  const getRoleIcon = (role: string) => {
    switch (role) {
      case "admin":
        return <Crown className="h-4 w-4" />
      case "co-admin":
        return <Shield className="h-4 w-4" />
      default:
        return <Users className="h-4 w-4" />
    }
  }

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case "admin":
        return "bg-yellow-500"
      case "co-admin":
        return "bg-blue-500"
      default:
        return "bg-gray-500"
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card>
          <CardContent className="p-6 text-center">
            <p className="mb-4">Loading meeting...</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Only show "meeting not found" if we've explicitly determined it doesn't exist
  // AND this is not a creator session
  if (meetingNotFound && !userInfo?.isCreator) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card>
          <CardContent className="p-6 text-center">
            <p className="mb-4">Meeting not found</p>
            <p className="text-sm text-gray-600 mb-4">The meeting ID "{meetingId}" does not exist or has ended.</p>
            <Button onClick={() => router.push("/")} variant="outline">
              Go Home
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!isJoined) {
    console.log("=== JOIN FORM DEBUG ===")
    console.log("User info:", userInfo)
    console.log("User info isCreator:", userInfo?.isCreator)
    console.log("Should show start button:", userInfo?.isCreator)
    console.log("Meeting data:", meeting)
    console.log("Approval status:", approvalStatus)

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>{meeting?.title || `Meeting ${meetingId}`}</CardTitle>
            {meeting?.description && <p className="text-sm text-gray-600">{meeting.description}</p>}
            {meeting?.accessType && (
              <Badge variant="outline" className="w-fit">
                {meeting.accessType === "approval" && "Requires Approval"}
                {meeting.accessType === "email" && "Email Restricted"}
                {meeting.accessType === "open" && "Open Access"}
              </Badge>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {userInfo?.isCreator ? (
              // Meeting creator can start directly (only if this is the creator session AND they are marked as creator)
              <div className="text-center space-y-4">
                <p className="text-sm text-gray-600">Welcome back, {userInfo.firstName}!</p>
                <Button onClick={startMeeting} className="w-full">
                  Start Meeting
                </Button>
              </div>
            ) : approvalStatus.requiresApproval ? (
              // Show approval waiting screen
              <div className="text-center space-y-4">
                {approvalStatus.isWaiting ? (
                  <>
                    <div className="flex items-center justify-center mb-4">
                      <Clock className="h-12 w-12 text-blue-500 animate-pulse" />
                    </div>
                    <h3 className="text-lg font-semibold">Waiting for Approval</h3>
                    <p className="text-sm text-gray-600">{approvalStatus.message}</p>
                    <p className="text-xs text-gray-500">
                      The meeting host will be notified of your request. Please wait...
                    </p>
                    <div className="text-xs text-gray-400">Checking status automatically every 3 seconds...</div>
                    <Button onClick={checkApprovalStatus} variant="outline" className="w-full" disabled={isJoining}>
                      {isJoining ? "Checking..." : "Check Status Now"}
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-center mb-4">
                      <CheckCircle className="h-12 w-12 text-green-500" />
                    </div>
                    <h3 className="text-lg font-semibold">Request Processed</h3>
                    <p className="text-sm text-gray-600">{approvalStatus.message}</p>
                    {approvalStatus.message.includes("approved") && (
                      <Button onClick={joinMeeting} className="w-full" disabled={isJoining}>
                        {isJoining ? "Joining..." : "Join Meeting"}
                      </Button>
                    )}
                  </>
                )}
              </div>
            ) : (
              // All other users (including creator in new tab) need to provide their info
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name</Label>
                    <Input
                      id="firstName"
                      placeholder="Enter first name"
                      value={joinForm.firstName}
                      onChange={(e) => setJoinForm((prev) => ({ ...prev, firstName: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input
                      id="lastName"
                      placeholder="Enter last name"
                      value={joinForm.lastName}
                      onChange={(e) => setJoinForm((prev) => ({ ...prev, lastName: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="Enter email address"
                    value={joinForm.email}
                    onChange={(e) => setJoinForm((prev) => ({ ...prev, email: e.target.value }))}
                  />
                </div>
                <Button onClick={joinMeeting} className="w-full" disabled={isJoining}>
                  {isJoining ? "Joining..." : "Join Meeting"}
                </Button>
              </>
            )}
            <Button onClick={() => router.push("/")} variant="outline" className="w-full">
              Cancel
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }


  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <div className="bg-gray-800 p-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{meeting?.title || `Meeting ${meetingId}`}</h1>
          <div className="flex items-center space-x-2 mt-1">
            <Badge className={`${getRoleBadgeColor(userRole?.role || "participant")} text-white`}>
              {getRoleIcon(userRole?.role || "participant")}
              <span className="ml-1 capitalize">{userRole?.role || "participant"}</span>
            </Badge>
            <span className="text-sm text-gray-400">
              {participants.length} participant{participants.length !== 1 ? "s" : ""}
            </span>
            <Badge variant="default" className="text-xs">
              ID: {meetingId}
            </Badge>
          </div>
          <div className="mt-6 text-2xl font-medium text-blue-600">
            Welcome, {userInfo?.firstName}!
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {userRole?.role === "admin" && (
            <Button onClick={() => setShowApprovalPanel(true)} variant="default" className="relative">
              <UserCheck className="h-4 w-4 mr-2" />
              Approvals
              {pendingApprovalCount > 0 && (
                <Badge className="absolute -top-2 -right-2 bg-red-500 text-white text-xs min-w-[20px] h-5 flex items-center justify-center rounded-full">
                  {pendingApprovalCount}
                </Badge>
              )}
            </Button>
          )}
          <Button onClick={leaveMeeting} variant="destructive">
            <Phone className="h-4 w-4 mr-2" />
            Leave
          </Button>
        </div>
      </div>

      <div className="flex h-[calc(100vh-80px)]">
        {/* Main Video Area */}
        <div className="flex-1 p-4">
          <VideoGrid
            participants={participants}
            localStream={localStream}
            localVideoRef={localVideoRef}
            isVideoEnabled={isVideoEnabled}
          />
        </div>

        {/* Sidebar */}
        <div className="w-80 bg-gray-800 p-4 overflow-y-auto">
          <ParticipantsList
            participants={participants}
            userRole={userRole}
            meetingId={meetingId}
            onParticipantsUpdate={setParticipants}
          />
        </div>
      </div>

      {/* Bottom Controls */}
      <MeetingControls
        isAudioEnabled={isAudioEnabled}
        isVideoEnabled={isVideoEnabled}
        onToggleAudio={toggleAudio}
        onToggleVideo={toggleVideo}
        onLeaveMeeting={leaveMeeting}
        userRole={userRole}
        meetingId={meetingId}
      />

      {/* Approval Panel */}
      {meeting && (
        <ApprovalPanel
          meetingId={meetingId}
          isVisible={showApprovalPanel}
          onClose={() => setShowApprovalPanel(false)}
        />
      )}
    </div>
  )
}
