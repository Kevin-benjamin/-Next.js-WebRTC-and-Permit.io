import { type NextRequest, NextResponse } from "next/server"
import { permit } from "@/lib/permit"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { meetingId, approvalId, action, adminUserId } = body // action: 'approve' or 'reject'

    console.log("Approval action:", { meetingId, approvalId, action, adminUserId })

    // Verify that the admin has permission to manage approvals
    const canManage = await permit.check(adminUserId, "moderate", `web-rtc:${meetingId}`) // Using moderate as general admin permission
    if (!canManage) {
      return NextResponse.json({ success: false, error: "Insufficient permissions" }, { status: 403 })
    }

    // Get current meeting data from Permit.io
    try {
      const resourceInstance = await permit.api.resourceInstances.get(`web-rtc:${meetingId}`)
      const attributes = resourceInstance.attributes as { pendingApprovals?: string } || {}

      let pendingApprovals = []
      try {
        if (attributes.pendingApprovals) {
          pendingApprovals = JSON.parse(attributes.pendingApprovals)
        }
      } catch (parseError) {
        console.log("Could not parse pending approvals:", parseError)
      }

      console.log("Current pending approvals:", pendingApprovals)

      // Find the approval request
      const approvalIndex = pendingApprovals.findIndex((a: any) => a.id === approvalId)
      if (approvalIndex === -1) {
        return NextResponse.json({ success: false, error: "Approval request not found" }, { status: 404 })
      }

      const approval = pendingApprovals[approvalIndex]
      console.log("Found approval to process:", approval)

      if (action === "approve") {
        // Remove from pending approvals (approval granted)
        pendingApprovals.splice(approvalIndex, 1)

        // Update Permit.io
        await permit.api.resourceInstances.update(`web-rtc:${meetingId}`, {
          attributes: {
            ...attributes,
            pendingApprovals: JSON.stringify(pendingApprovals),
            lastUpdated: new Date().toISOString(),
          },
        })

        console.log("Approval granted for:", approval)

        return NextResponse.json({
          success: true,
          action: "approved",
          message: `Approved ${approval.name} to join the meeting`,
          approval,
        })
      } else if (action === "reject") {
        // Remove from pending approvals (approval rejected)
        pendingApprovals.splice(approvalIndex, 1)

        // Update Permit.io
        await permit.api.resourceInstances.update(`web-rtc:${meetingId}`, {
          attributes: {
            ...attributes,
            pendingApprovals: JSON.stringify(pendingApprovals),
            lastUpdated: new Date().toISOString(),
          },
        })

        console.log("Approval rejected for:", approval)

        return NextResponse.json({
          success: true,
          action: "rejected",
          message: `Rejected ${approval.name}'s request to join`,
          approval,
        })
      } else {
        return NextResponse.json(
          { success: false, error: "Invalid action. Use 'approve' or 'reject'" },
          { status: 400 },
        )
      }
    } catch (permitError) {
      console.error("Error accessing meeting in Permit.io:", permitError)
      return NextResponse.json({ success: false, error: "Meeting not found" }, { status: 404 })
    }
  } catch (error) {
    console.error("Error processing approval:", error)
    return NextResponse.json({ success: false, error: "Failed to process approval" }, { status: 500 })
  }
}
