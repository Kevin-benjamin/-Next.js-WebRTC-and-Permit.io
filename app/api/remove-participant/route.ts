import { type NextRequest, NextResponse } from "next/server"
import { permit } from "@/lib/permit"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { userId, meetingId, adminUserId } = body

    // Verify that the admin has permission to remove participants
    const canRemove = await permit.check(adminUserId, "moderate", `web-rtc:${meetingId}`) // Using mute as general admin permission
    if (!canRemove) {
      return NextResponse.json({ success: false, error: "Insufficient permissions" }, { status: 403 })
    }

    // Remove all role assignments for this user in this meeting
    try {
      const existingAssignments = await permit.api.roleAssignments.list({
        user: userId,
        tenant: "default",
        resource_instance: `web-rtc:${meetingId}`,
      })

      for (const assignment of existingAssignments) {
        await permit.api.roleAssignments.unassign({
          user: userId,
          role: assignment.role,
          tenant: "default",
          resource_instance: `web-rtc:${meetingId}`,
        })
      }
    } catch (error) {
      console.log("Error removing role assignments:", error)
    }

    return NextResponse.json({
      success: true,
      message: "Participant removed successfully",
    })
  } catch (error) {
    console.error("Error removing participant:", error)
    return NextResponse.json({ success: false, error: "Failed to remove participant" }, { status: 500 })
  }
}
