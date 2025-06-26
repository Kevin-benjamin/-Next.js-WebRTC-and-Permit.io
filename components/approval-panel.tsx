"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { UserCheck, UserX, Clock, Users, RefreshCw } from "lucide-react"
import { getMeetingFromGlobalRegistry, MeetingSync, type PendingApproval } from "@/lib/meeting-storage"
import { toast } from "sonner"

interface ApprovalPanelProps {
  meetingId: string
  isVisible: boolean
  onClose: () => void
}

export function ApprovalPanel({ meetingId, isVisible, onClose }: ApprovalPanelProps) {
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([])
  const [processingApprovals, setProcessingApprovals] = useState<Set<string>>(new Set())
  const [isLoading, setIsLoading] = useState(false)
  const [lastFetch, setLastFetch] = useState<number>(0)

  // Function to fetch pending approvals from the server
  const fetchPendingApprovals = async () => {
    if (!isVisible) return

    setIsLoading(true)
    try {
      console.log("Fetching pending approvals from server...")
      const response = await fetch(`/api/get-pending-approvals?meetingId=${meetingId}`)
      const data = await response.json()

      if (data.success) {
        console.log("Received pending approvals from server:", data.pendingApprovals)
        setPendingApprovals(data.pendingApprovals || [])
        setLastFetch(Date.now())

        // Also update the local meeting registry with the latest data
        const meeting = getMeetingFromGlobalRegistry(meetingId)
        if (meeting) {
          const registry = JSON.parse(localStorage.getItem("global-meetings-registry") || "{}")
          registry[meetingId] = {
            ...meeting,
            pendingApprovals: data.pendingApprovals || [],
          }
          localStorage.setItem("global-meetings-registry", JSON.stringify(registry))
        }
      } else {
        console.error("Failed to fetch pending approvals:", data.error)
      }
    } catch (error) {
      console.error("Error fetching pending approvals:", error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (!isVisible) return

    // Load initial pending approvals from local storage
    const meeting = getMeetingFromGlobalRegistry(meetingId)
    if (meeting) {
      setPendingApprovals(meeting.pendingApprovals || [])
    }

    // Fetch latest from server
    fetchPendingApprovals()

    // Set up polling every 5 seconds to check for new approvals
    const pollInterval = setInterval(() => {
      fetchPendingApprovals()
    }, 5000)

    // Subscribe to new approval requests from BroadcastChannel (for real-time updates)
    const meetingSync = MeetingSync.getInstance()
    meetingSync.subscribe("approval-request", meetingId, (approval: PendingApproval) => {
      console.log("Received approval request via BroadcastChannel:", approval)
      setPendingApprovals((prev) => {
        // Check if approval already exists to prevent duplicates
        if (prev.find((a) => a.id === approval.id)) {
          return prev
        }
        return [...prev, approval]
      })
    })

    return () => {
      clearInterval(pollInterval)
      meetingSync.unsubscribe("approval-request", meetingId)
    }
  }, [meetingId, isVisible])

  const handleApprove = async (approvalId: string) => {
    if (processingApprovals.has(approvalId)) return // Prevent double-clicking

    setProcessingApprovals((prev) => new Set(prev).add(approvalId))

    try {
      // Get current user's info for permission check
      const currentUserInfo = localStorage.getItem(`user-${meetingId}`)
      const adminUserId = currentUserInfo ? JSON.parse(currentUserInfo).userId : null

      if (!adminUserId) {
        toast.error("Admin user not found")
        return
      }

      console.log("Approving request:", { meetingId, approvalId, adminUserId })

      const response = await fetch("/api/approve-request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          meetingId,
          approvalId,
          action: "approve",
          adminUserId,
        }),
      })

      const data = await response.json()

      if (data.success) {
        console.log("Approval successful:", data)

        // Remove from local state
        setPendingApprovals((prev) => prev.filter((a) => a.id !== approvalId))

        // Broadcast approval to other tabs and the waiting user
        const meetingSync = MeetingSync.getInstance()
        const approval = pendingApprovals.find((a) => a.id === approvalId)
        if (approval) {
          meetingSync.broadcast("approval-granted", meetingId, {
            approvalId,
            sessionId: approval.sessionId,
          })
        }

        // Refresh the list from server to ensure consistency
        setTimeout(() => {
          fetchPendingApprovals()
        }, 1000)
      } else {
        toast.error(data.error || "Failed to approve request. Please try again.")
      }
    } catch (error) {
      console.error("Error approving request:", error)
      toast.error("Error approving request. Please try again.")
    } finally {
      setProcessingApprovals((prev) => {
        const newSet = new Set(prev)
        newSet.delete(approvalId)
        return newSet
      })
    }
  }

  const handleReject = async (approvalId: string) => {
    if (processingApprovals.has(approvalId)) return // Prevent double-clicking

    setProcessingApprovals((prev) => new Set(prev).add(approvalId))

    try {
      // Get current user's info for permission check
      const currentUserInfo = localStorage.getItem(`user-${meetingId}`)
      const adminUserId = currentUserInfo ? JSON.parse(currentUserInfo).userId : null

      if (!adminUserId) {
        toast.error("Admin user not found")
        return
      }

      console.log("Rejecting request:", { meetingId, approvalId, adminUserId })

      const response = await fetch("/api/approve-request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          meetingId,
          approvalId,
          action: "reject",
          adminUserId,
        }),
      })

      const data = await response.json()

      if (data.success) {
        console.log("Rejection successful:", data)

        // Remove from local state
        setPendingApprovals((prev) => prev.filter((a) => a.id !== approvalId))

        // Broadcast rejection to other tabs and the waiting user
        const meetingSync = MeetingSync.getInstance()
        const approval = pendingApprovals.find((a) => a.id === approvalId)
        if (approval) {
          meetingSync.broadcast("approval-rejected", meetingId, {
            approvalId,
            sessionId: approval.sessionId,
          })
        }

        // Refresh the list from server to ensure consistency
        setTimeout(() => {
          fetchPendingApprovals()
        }, 1000)
      } else {
        toast.error(data.error || "Failed to reject request. Please try again.")
      }
    } catch (error) {
      console.error("Error rejecting request:", error)
      toast.error("Error rejecting request. Please try again.")
    } finally {
      setProcessingApprovals((prev) => {
        const newSet = new Set(prev)
        newSet.delete(approvalId)
        return newSet
      })
    }
  }

  const handleRefresh = () => {
    fetchPendingApprovals()
  }

  if (!isVisible) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <Card className="w-full max-w-md max-h-96 overflow-hidden">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center">
              <Users className="h-5 w-5 mr-2" />
              Approval Requests ({pendingApprovals.length})
            </CardTitle>
            <div className="flex items-center space-x-2">
              <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={isLoading} className="h-8 w-8 p-0">
                <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
              </Button>
              <Button variant="ghost" size="sm" onClick={onClose}>
                ✕
              </Button>
            </div>
          </div>
          {lastFetch > 0 && (
            <p className="text-xs text-gray-500">Last updated: {new Date(lastFetch).toLocaleTimeString()}</p>
          )}
        </CardHeader>
        <CardContent className="space-y-3 max-h-64 overflow-y-auto">
          {isLoading && pendingApprovals.length === 0 ? (
            <div className="text-center py-4">
              <RefreshCw className="h-6 w-6 mx-auto mb-2 animate-spin" />
              <p className="text-sm text-gray-500">Loading approval requests...</p>
            </div>
          ) : pendingApprovals.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Clock className="h-12 w-12 mx-auto mb-2" />
              <p>No pending approval requests</p>
            </div>
          ) : (
            pendingApprovals.map((approval) => (
              <div key={approval.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-medium">{approval.name}</span>
                    <Badge variant="outline" className="text-xs">
                      <Clock className="h-3 w-3 mr-1" />
                      {new Date(approval.requestedAt).toLocaleTimeString()}
                    </Badge>
                  </div>
                  {approval.email && <p className="text-sm text-gray-600">{approval.email}</p>}
                </div>
                <div className="flex space-x-2">
                  <Button
                    size="sm"
                    onClick={() => handleApprove(approval.id)}
                    disabled={processingApprovals.has(approval.id)}
                    className="bg-green-600 hover:bg-green-700 disabled:opacity-50"
                  >
                    <UserCheck className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleReject(approval.id)}
                    disabled={processingApprovals.has(approval.id)}
                    className="disabled:opacity-50"
                  >
                    <UserX className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
