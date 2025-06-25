"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Textarea } from "@/components/ui/textarea"
import { Video, Users, Settings } from "lucide-react"
import { toast } from "sonner"

interface MeetingSettings {
  title: string
  description: string
  accessType: "open" | "approval" | "email"
  allowedEmails: string
  email: string
  firstName: string
  lastName: string
}

export default function HomePage() {
  const router = useRouter()
  const [settings, setSettings] = useState<MeetingSettings>({
    title: "",
    description: "",
    accessType: "open",
    allowedEmails: "",
    email: "",
    firstName: "",
    lastName: "",
  })

  const [joinMeetingId, setJoinMeetingId] = useState("")
  const [isCreating, setIsCreating] = useState(false)

  const createMeeting = async () => {
    if (!settings.title.trim() || !settings.email.trim() || !settings.firstName.trim() || !settings.lastName.trim()) {
      toast.error("Please fill in all required fields")
      return
    }

    setIsCreating(true)

    try {
      console.log("Creating meeting with settings:", settings)

      const response = await fetch("/api/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(settings),
      })

      const data = await response.json()
      console.log("API response:", data)

      if (data.success) {
        console.log("Meeting created successfully:", data)

        // Store user info in localStorage for the meeting with creator flag
        const userInfo = {
          userId: data.userId,
          email: settings.email,
          firstName: settings.firstName,
          lastName: settings.lastName,
          isCreator: true,
        }

        localStorage.setItem(`user-${data.meetingId}`, JSON.stringify(userInfo))
        console.log("Stored user info:", userInfo)

        // Store the complete meeting data in localStorage as well
        if (data.meeting) {
          // Add the missing fields that are needed for the client
          const completeMetingData = {
            ...data.meeting,
            creatorSessionId: sessionStorage.getItem("session-id") || `session-${Date.now()}`,
            pendingApprovals: [],
          }

          // Save to the global registry format
          const registry = JSON.parse(localStorage.getItem("global-meetings-registry") || "{}")
          registry[data.meetingId] = completeMetingData
          localStorage.setItem("global-meetings-registry", JSON.stringify(registry))
          console.log("Saved meeting to global registry:", completeMetingData)
        }

        // Manually set the creator flag to ensure it's set
        sessionStorage.setItem(`meeting-creator-${data.meetingId}`, "true")
        console.log("Manually set creator flag for meeting:", data.meetingId)

        // Add a longer delay to ensure all data is saved
        setTimeout(() => {
          console.log("Redirecting to meeting:", data.meetingId)
          router.push(`/meeting/${data.meetingId}`)
        }, 200)
      } else {
        toast.error(data.error || "Failed to create meeting")
      }
    } catch (error) {
      console.error("Error creating meeting:", error)
      toast.error("Failed to create meeting")
    } finally {
      setIsCreating(false)
    }
  }

  const joinMeeting = () => {
    if (!joinMeetingId.trim()) {
      toast.error("Please enter a meeting ID")
      return
    }
    router.push(`/meeting/${joinMeetingId}`)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <Video className="h-12 w-12 text-blue-600 mr-3" />
            <h1 className="text-4xl font-bold text-gray-900">VideoMeet WebRTC</h1>
          </div>
          <p className="text-xl text-gray-600">Secure video conferencing with Permit.io role management</p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Create Meeting */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Settings className="h-5 w-5 mr-2" />
                Create New Meeting
              </CardTitle>
              <CardDescription>Set up a new video conference with custom settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Personal Information */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name *</Label>
                  <Input
                    id="firstName"
                    placeholder="Enter first name"
                    value={settings.firstName}
                    onChange={(e) => setSettings((prev) => ({ ...prev, firstName: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name *</Label>
                  <Input
                    id="lastName"
                    placeholder="Enter last name"
                    value={settings.lastName}
                    onChange={(e) => setSettings((prev) => ({ ...prev, lastName: e.target.value }))}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email Address *</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="Enter email address"
                  value={settings.email}
                  onChange={(e) => setSettings((prev) => ({ ...prev, email: e.target.value }))}
                />
              </div>

              {/* Meeting Information */}
              <div className="space-y-2">
                <Label htmlFor="title">Meeting Title *</Label>
                <Input
                  id="title"
                  placeholder="Enter meeting title"
                  value={settings.title}
                  onChange={(e) => setSettings((prev) => ({ ...prev, title: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description (Optional)</Label>
                <Textarea
                  id="description"
                  placeholder="Meeting description"
                  value={settings.description}
                  onChange={(e) => setSettings((prev) => ({ ...prev, description: e.target.value }))}
                />
              </div>

              <div className="space-y-3">
                <Label>Access Control</Label>
                <RadioGroup
                  value={settings.accessType}
                  onValueChange={(value: "open" | "approval" | "email") =>
                    setSettings((prev) => ({ ...prev, accessType: value }))
                  }
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="open" id="open" />
                    <Label htmlFor="open">Anyone with link can join</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="approval" id="approval" />
                    <Label htmlFor="approval">Require approval to join</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="email" id="email" />
                    <Label htmlFor="email">Only specific emails can join</Label>
                  </div>
                </RadioGroup>
              </div>

              {settings.accessType === "email" && (
                <div className="space-y-2">
                  <Label htmlFor="emails">Allowed Email Addresses</Label>
                  <Textarea
                    id="emails"
                    placeholder="Enter email addresses, one per line"
                    value={settings.allowedEmails}
                    onChange={(e) => setSettings((prev) => ({ ...prev, allowedEmails: e.target.value }))}
                  />
                </div>
              )}

              <Button
                onClick={createMeeting}
                className="w-full"
                disabled={
                  !settings.title.trim() ||
                  !settings.email.trim() ||
                  !settings.firstName.trim() ||
                  !settings.lastName.trim() ||
                  isCreating
                }
              >
                {isCreating ? "Creating..." : "Create Meeting"}
              </Button>
            </CardContent>
          </Card>

          {/* Join Meeting */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Users className="h-5 w-5 mr-2" />
                Join Meeting
              </CardTitle>
              <CardDescription>Enter a meeting ID to join an existing conference</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="meetingId">Meeting ID</Label>
                <Input
                  id="meetingId"
                  placeholder="Enter meeting ID"
                  value={joinMeetingId}
                  onChange={(e) => setJoinMeetingId(e.target.value)}
                />
              </div>
              <Button onClick={joinMeeting} variant="outline" className="w-full" disabled={!joinMeetingId.trim()}>
                Join Meeting
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Recent Meetings */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Recent Meetings</CardTitle>
            <CardDescription>Your recently created or joined meetings</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-gray-500 text-center py-4">No recent meetings</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
